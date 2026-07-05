const { sendFcmToToken } = require('./firebase.service');
const { logger } = require('../utils/logger');

// In-memory device token store — keyed by userId
// { userId: [{ token, platform }] }
const tokenMap = new Map();

/**
 * Send a push notification to all registered tokens for a user.
 */
async function sendPushNotification(userId, _schoolId, { title, body, data = {} }) {
  try {
    const tokens = tokenMap.get(userId) || [];
    if (tokens.length === 0) {
      logger.debug(`No device tokens for user ${userId}`);
      return;
    }

    const expired = [];
    for (const entry of tokens) {
      const result = await sendFcmToToken(entry.token, title, body, data);
      if (result.expired) expired.push(entry.token);
    }

    if (expired.length > 0) {
      const active = (tokenMap.get(userId) || []).filter(e => !expired.includes(e.token));
      tokenMap.set(userId, active);
      logger.info(`Removed ${expired.length} expired FCM tokens for user ${userId}`);
    }
  } catch (err) {
    logger.error(`sendPushNotification failed for user ${userId}:`, err);
  }
}

/**
 * Register or refresh a device token for a user.
 * Called by the Flutter app on session start via POST /chat/device-token.
 */
async function registerDeviceToken(userId, _schoolId, _userRole, deviceToken, platform) {
  const existing = tokenMap.get(userId) || [];
  const filtered = existing.filter(e => e.token !== deviceToken);
  filtered.push({ token: deviceToken, platform });
  tokenMap.set(userId, filtered);
  logger.debug(`Registered device token for user ${userId} (${platform})`);
}

module.exports = { sendPushNotification, registerDeviceToken };
