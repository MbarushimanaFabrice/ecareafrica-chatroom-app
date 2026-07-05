const { logger } = require('../utils/logger');

// In-memory presence store — keyed by userId
// { userId: { school_id, is_online, last_seen_at } }
const presenceMap = new Map();

// ── PUT /chat/status/heartbeat ────────────────────────────────────────────────
async function heartbeat(req, res) {
  try {
    const { sub: userId, school_id: schoolId } = req.user;
    presenceMap.set(userId, {
      school_id:    schoolId,
      is_online:    true,
      last_seen_at: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('heartbeat error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── GET /chat/status/:userId ──────────────────────────────────���───────────────
async function getUserStatus(req, res) {
  try {
    const { userId } = req.params;
    const entry = presenceMap.get(userId);
    if (!entry) {
      return res.json({ data: { is_online: false, last_seen_at: null } });
    }
    res.json({ data: { is_online: entry.is_online, last_seen_at: entry.last_seen_at } });
  } catch (err) {
    logger.error('getUserStatus error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

module.exports = { heartbeat, getUserStatus };
