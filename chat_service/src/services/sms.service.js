'use strict';

const axios  = require('axios');
const { logger } = require('../utils/logger');

/**
 * Normalize phone for the SMS gateway.
 * The eMedia API expects local format (e.g. 0773666640), not E.164.
 * Strip a leading '+' if present; keep everything else as-is.
 */
function formatPhone(phone) {
  return phone.trim().replace(/^\+/, '');
}

/**
 * Send an OTP or notification SMS directly to a phone number.
 * Credentials and sender ID come from environment variables — never hardcoded.
 */
async function sendSmsRaw(phone, message) {
  const recipient = formatPhone(phone);

  // Always log in dev so tests can read the OTP without a real SIM
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`[DEV SMS] To: ${recipient} | ${message}`);
  }

  try {
    const response = await axios.get('http://text.emediauganda.com/api.php', {
      params: {
        user:     process.env.SMS_USER,
        password: process.env.SMS_PASSWORD,
        sender:   process.env.SMS_SENDER_ID || 'ECareAfrica',
        message,
        reciever: recipient,   // note: gateway spells it 'reciever'
      },
      timeout: 10000,
    });

    logger.info(`SMS delivered to ${recipient.slice(0, 6)}**** — gateway: ${JSON.stringify(response.data)}`);
    return { success: true, response: response.data };
  } catch (err) {
    logger.error(`SMS gateway error for ${recipient.slice(0, 6)}****: ${err.message}`);
    throw err;
  }
}

module.exports = { sendSmsRaw };
