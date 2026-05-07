const prisma = require('../lib/prisma');
const { sendEmail } = require('../utils/emailService');

/**
 * POST /api/jobs/run-scheduled-emails
 *
 * Secured by the x-cron-secret header (NOT JWT).
 * Called externally by cron-job.org every minute.
 *
 * Finds all PENDING emails whose scheduledAt <= now,
 * sends them via Brevo, marks SENT or FAILED.
 */
const runScheduledEmails = async (req, res) => {
  // ── Auth: validate the cron secret header ─────────────────────────────────
  const secret = req.headers['x-cron-secret'];
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ status: 'fail', message: 'Unauthorized.' });
  }

  const now = new Date();

  // ── Find all PENDING emails that are due ───────────────────────────────────
  const due = await prisma.scheduledEmail.findMany({
    where: {
      status:      'PENDING',
      scheduledAt: { lte: now },
    },
    take: 50, // safety cap — process max 50 at once
  });

  // No early return here, we still need to process campaigns!

  let sent = 0, failed = 0;

  for (const email of due) {
    try {
      await sendEmail(email.to, email.toName || email.to, email.subject, email.htmlBody);

      await prisma.scheduledEmail.update({
        where: { id: email.id },
        data:  { status: 'SENT', sentAt: new Date() },
      });
      sent++;
    } catch (err) {
      console.error(`[ScheduledEmail] Failed to send ${email.id}:`, err.message);
      await prisma.scheduledEmail.update({
        where: { id: email.id },
        data:  { status: 'FAILED', errorMsg: err.message },
      });
      failed++;
    }
  }

  console.log(`[ScheduledEmail] Processed ${due.length} — sent: ${sent}, failed: ${failed}`);

  // ── Process Email Campaigns ────────────────────────────────────────────────
  let campaignProcessed = 0;
  let campaignSent = 0;
  let campaignFailed = 0;

  // 1. Move due SCHEDULED campaigns to SENDING
  await prisma.campaign.updateMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: now }
    },
    data: { status: 'SENDING' }
  });

  // 2. Find active SENDING campaigns
  const activeCampaigns = await prisma.campaign.findMany({
    where: { status: 'SENDING' },
    take: 5 // process up to 5 campaigns at a time
  });

  for (const campaign of activeCampaigns) {
    // Get up to 20 pending recipients per campaign
    const recipients = await prisma.campaignRecipient.findMany({
      where: { campaignId: campaign.id, status: 'PENDING' },
      take: 20
    });

    if (recipients.length === 0) {
      // Campaign is done
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'SENT' }
      });
      continue;
    }

    let batchSent = 0;
    let batchFailed = 0;

    for (const recipient of recipients) {
      try {
        // Replace placeholders like {{name}}
        const htmlBody = campaign.htmlBody.replace(/\{\{name\}\}/gi, recipient.name || 'there');
        
        await sendEmail(recipient.email, recipient.name || recipient.email, campaign.subject, htmlBody);

        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'SENT', sentAt: new Date() }
        });
        batchSent++;
      } catch (err) {
        console.error(`[Campaign] Failed to send to ${recipient.email}:`, err.message);
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status: 'FAILED', errorMsg: err.message }
        });
        batchFailed++;
      }
    }

    // Update campaign stats
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        totalSent: { increment: batchSent },
        totalFailed: { increment: batchFailed }
      }
    });

    // Check if there are any remaining pending recipients. If not, mark campaign as SENT immediately.
    const remaining = await prisma.campaignRecipient.count({
      where: { campaignId: campaign.id, status: 'PENDING' }
    });
    
    if (remaining === 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'SENT' }
      });
    }

    campaignProcessed += recipients.length;
    campaignSent += batchSent;
    campaignFailed += batchFailed;
  }

  if (campaignProcessed > 0) {
    console.log(`[Campaigns] Processed ${campaignProcessed} — sent: ${campaignSent}, failed: ${campaignFailed}`);
  }

  res.json({ 
    status: 'success', 
    scheduledEmails: { processed: due.length, sent, failed },
    campaigns: { processed: campaignProcessed, sent: campaignSent, failed: campaignFailed }
  });
};

module.exports = { runScheduledEmails };
