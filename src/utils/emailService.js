const axios = require('axios');

const sendEmail = async (toEmail, toName, subject, htmlContent) => {
  if (process.env.EMAIL_PROVIDER !== 'brevo') {
    console.warn('Email provider is not configured as brevo. Skipping email send.');
    return;
  }

  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@traincapetech.in';
  const senderName = process.env.BREVO_SENDER_NAME || 'Second Police CRM';

  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail, name: toName }],
        subject: subject,
        htmlContent: htmlContent
      },
      {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error sending email:', error.response?.data || error.message);
    throw new Error('Failed to send email. Please try again.');
  }
};

module.exports = { sendEmail };
