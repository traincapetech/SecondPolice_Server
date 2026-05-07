const prisma = require('../lib/prisma');
const AppError = require('../utils/appError');

/**
 * GET /api/campaigns
 * Get all campaigns for the tenant
 */
const getCampaigns = async (req, res, next) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { recipients: true },
        },
      },
    });
    res.json({ status: 'success', data: { campaigns } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/campaigns/:id
 * Get campaign details and recipients
 */
const getCampaign = async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: {
        recipients: true,
      },
    });

    if (!campaign) {
      return next(new AppError('Campaign not found', 404));
    }

    res.json({ status: 'success', data: { campaign } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/campaigns
 * Create a new campaign
 */
const createCampaign = async (req, res, next) => {
  try {
    const { name, subject, htmlBody } = req.body;

    if (!name || !subject || !htmlBody) {
      return next(new AppError('Name, subject, and htmlBody are required', 400));
    }

    const campaign = await prisma.campaign.create({
      data: {
        tenantId: req.user.tenantId,
        createdById: req.user.id,
        name,
        subject,
        htmlBody,
      },
    });

    res.status(201).json({ status: 'success', data: { campaign } });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/campaigns/:id
 * Update campaign details
 */
const updateCampaign = async (req, res, next) => {
  try {
    const { name, subject, htmlBody, scheduledAt, status } = req.body;
    
    const existing = await prisma.campaign.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
    });

    if (!existing) {
      return next(new AppError('Campaign not found', 404));
    }
    
    // We now allow updating campaigns at any time (e.g. to reuse them as templates)
    // Only status updates to SENDING/SCHEDULED/CANCELLED are restricted by UI logic.

    let scheduledDate = undefined;
    if (scheduledAt) {
      scheduledDate = new Date(scheduledAt);
      if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
        return next(new AppError('scheduledAt must be a valid future date', 400));
      }
    }

    const campaign = await prisma.campaign.update({
      where: { id: existing.id },
      data: {
        ...(name && { name }),
        ...(subject && { subject }),
        ...(htmlBody && { htmlBody }),
        ...(scheduledAt !== undefined && { scheduledAt: scheduledDate }),
        ...(status && { status }),
      },
    });

    res.json({ status: 'success', data: { campaign } });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/campaigns/:id
 * Delete a campaign (cascades to recipients)
 */
const deleteCampaign = async (req, res, next) => {
  try {
    const existing = await prisma.campaign.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
    });

    if (!existing) {
      return next(new AppError('Campaign not found', 404));
    }

    await prisma.campaign.delete({
      where: { id: existing.id },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/campaigns/:id/recipients
 * Add recipients to a campaign
 */
const addRecipients = async (req, res, next) => {
  try {
    const { recipients } = req.body; // Array of { email, name, entityType, entityId }
    
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return next(new AppError('Recipients array is required', 400));
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
    });

    if (!campaign) return next(new AppError('Campaign not found', 404));
    // Allowed at any time to add new recipients to existing templates

    // Filter out existing recipients by email to prevent duplicates in the same campaign
    const existingRecipients = await prisma.campaignRecipient.findMany({
      where: { campaignId: campaign.id },
      select: { email: true }
    });
    
    const existingEmails = new Set(existingRecipients.map(r => r.email.toLowerCase()));
    
    const newRecipients = recipients
      .filter(r => r.email && !existingEmails.has(r.email.toLowerCase()))
      .map(r => ({
        campaignId: campaign.id,
        email: r.email,
        name: r.name || null,
        entityType: r.entityType || null,
        entityId: r.entityId || null,
        status: 'PENDING'
      }));

    if (newRecipients.length > 0) {
      await prisma.campaignRecipient.createMany({
        data: newRecipients
      });
    }

    res.json({ 
      status: 'success', 
      message: `Added ${newRecipients.length} new recipients` 
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/campaigns/:id/recipients/:recipientId
 * Remove a recipient from a draft campaign
 */
const removeRecipient = async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
    });

    if (!campaign) return next(new AppError('Campaign not found', 404));
    // Instead of DRAFT check, just ensure we only delete PENDING recipients
    // so we don't accidentally delete historical SENT/FAILED data.

    await prisma.campaignRecipient.deleteMany({
      where: { 
        id: req.params.recipientId,
        campaignId: campaign.id,
        status: 'PENDING'
      }
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/campaigns/:id/send
 * Start sending the campaign (or schedule it if scheduledAt is set)
 */
const startCampaign = async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
    });

    if (!campaign) return next(new AppError('Campaign not found', 404));
    // We allow starting a campaign at any time (it will process any PENDING recipients)

    const recipientCount = await prisma.campaignRecipient.count({
      where: { campaignId: campaign.id }
    });

    if (recipientCount === 0) {
      return next(new AppError('Cannot start a campaign with no recipients', 400));
    }

    const newStatus = campaign.scheduledAt && campaign.scheduledAt > new Date() ? 'SCHEDULED' : 'SENDING';

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: newStatus },
    });

    res.json({ status: 'success', data: { campaign: updated } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  addRecipients,
  removeRecipient,
  startCampaign
};
