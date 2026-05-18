const nodemailer = require('nodemailer');
const axios = require('axios');

/**
 * Sends an email using either standard SMTP (Nodemailer) or the Brevo HTTP API.
 * Standard SMTP is highly recommended for local development to bypass Brevo's strict REST API IP whitelist firewalls.
 *
 * @param {string} toEmail
 * @param {string} toName
 * @param {string} subject
 * @param {string} htmlContent
 * @param {Array}  attachments  - Optional: [{ name: 'invoice.pdf', content: '<base64string>' }]
 */
const sendEmail = async (toEmail, toName, subject, htmlContent, attachments = []) => {
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@traincapetech.in';
  const senderName = process.env.BREVO_SENDER_NAME || 'Second Police CRM';

  // ─── OPTION 1: SMTP Transporter (Recommended to bypass local IP whitelisting) ───
  const useSMTP = process.env.SMTP_HOST || process.env.SMTP_USER;
  if (useSMTP) {
    const host = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER || senderEmail;
    const pass = process.env.SMTP_PASS || process.env.BREVO_API_KEY;

    console.log(`📧 Sending email via SMTP [${host}:${port}] for local IP bypass...`);

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for 587
      auth: {
        user,
        pass,
      },
    });

    // Map base64 attachments to Nodemailer format
    const formattedAttachments = attachments.map(att => ({
      filename: att.name,
      content: Buffer.from(att.content, 'base64'),
    }));

    const mailOptions = {
      from: `"${senderName}" <${senderEmail}>`,
      to: `"${toName}" <${toEmail}>`,
      subject,
      html: htmlContent,
      attachments: formattedAttachments,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully via SMTP: ${info.messageId}`);
      return info;
    } catch (error) {
      console.error('❌ Nodemailer SMTP sending failed:', error.message);
      throw new Error(`SMTP dispatch failed: ${error.message}`);
    }
  }

  // ─── OPTION 2: Fallback to Brevo REST API ───
  if (process.env.EMAIL_PROVIDER !== 'brevo') {
    console.warn('⚠️ Email provider is not configured. Skipping email send.');
    return;
  }

  console.log(`🌐 Sending email via Brevo REST API...`);
  const apiKey = process.env.BREVO_API_KEY;

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: toEmail, name: toName }],
    subject,
    htmlContent,
  };

  if (attachments.length > 0) {
    payload.attachment = attachments; // Brevo expects: [{ name, content (base64) }]
  }

  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      payload,
      {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Email sent successfully via Brevo REST API: ${response.data.messageId || 'Done'}`);
    return response.data;
  } catch (error) {
    console.error('❌ Brevo API sending failed:', error.response?.data || error.message);
    throw new Error('Failed to send email via Brevo REST API.');
  }
};

module.exports = { sendEmail };
