const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { queryEca } = require('../db/ecafrica_pool');
const { sendSmsRaw } = require('../services/sms.service');
const { logger } = require('../utils/logger');

// In-memory OTP store — keyed by phone (teacher/parent) or student_id_number (student)
const otpStore = new Map();

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function storeOtp(key, payload) {
  const expiresAt = Date.now() + parseInt(process.env.OTP_EXPIRES_MINUTES || '10') * 60 * 1000;
  otpStore.set(key, { ...payload, expiresAt });
}

function consumeOtp(key, otp) {
  const stored = otpStore.get(key);
  if (!stored) return { ok: false, reason: 'NO_OTP' };
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(key);
    return { ok: false, reason: 'EXPIRED' };
  }
  if (stored.otp !== otp.trim()) return { ok: false, reason: 'WRONG' };
  otpStore.delete(key);
  return { ok: true, stored };
}

// ── POST /auth/login  (teacher or parent) ────────────────────────────────────
async function login(req, res) {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'phone and password are required.',
      });
    }

    const result = await queryEca(
      `SELECT u.id, u.uuid, u.school_id, u.name, u.phone, u.password_hash, u.role, u.status,
              s.uuid AS school_uuid
       FROM   users u
       JOIN   schools s ON s.id = u.school_id
       WHERE  u.phone = $1
         AND  u.role IN ('teacher','parent','school_admin')
         AND  u.deleted_at IS NULL
       LIMIT 1`,
      [phone.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Phone number not found or not registered as teacher/parent.',
      });
    }

    const user = result.rows[0];

    if (user.status !== 'active') {
      return res.status(401).json({
        error: 'ACCOUNT_INACTIVE',
        message: 'Your account is inactive. Contact your school admin.',
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Incorrect password.',
      });
    }

    const otp = generateOtp();
    storeOtp(phone.trim(), { otp, user });

    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[DEV] OTP for ${phone}: ${otp}`);
    }

    const mins = process.env.OTP_EXPIRES_MINUTES || 10;
    const smsBody = `ECareAfrica Login\n\nYour one-time password is: ${otp}\n\nValid for ${mins} minutes. Do not share this code with anyone.`;
    try {
      await sendSmsRaw(user.phone, smsBody);
      logger.info(`OTP sent to ${user.role} ${user.uuid} (${phone.slice(0, 6)}****)`);
    } catch (smsErr) {
      logger.warn(`SMS delivery failed for ${phone.slice(0, 6)}****: ${smsErr.message}`);
    }

    res.json({ success: true, message: 'OTP sent to your registered phone number.' });
  } catch (err) {
    logger.error('login error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── POST /auth/verify-otp  (teacher or parent) ───────────────────────────────
async function verifyOtp(req, res) {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'phone and otp are required.',
      });
    }

    const { ok, reason, stored } = consumeOtp(phone.trim(), otp);

    if (!ok) {
      const messages = {
        NO_OTP:  'No OTP found. Please request a new one.',
        EXPIRED: 'OTP has expired. Please request a new one.',
        WRONG:   'Incorrect OTP. Please try again.',
      };
      return res.status(401).json({ error: 'OTP_INVALID', message: messages[reason] });
    }

    const { user } = stored;
    const payload = {
      sub:       user.uuid.trim(),
      user_id:   user.uuid.trim(),
      school_id: user.school_uuid.trim(),
      role:      user.role,
      name:      user.name,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    logger.info(`JWT issued for ${user.role} ${user.uuid}`);
    res.json({ token, role: user.role, name: user.name });
  } catch (err) {
    logger.error('verifyOtp error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── POST /auth/student/request-otp ───────────────────────────────────────────
async function requestStudentOtp(req, res) {
  try {
    const { student_id } = req.body;
    if (!student_id) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'student_id (roll number) is required.',
      });
    }

    const result = await queryEca(
      `SELECT s.id, s.uuid, s.school_id,
              s.first_name || ' ' || s.last_name AS full_name,
              s.student_id_number,
              pg.phone AS parent_phone,
              sc.uuid  AS school_uuid
       FROM   students s
       JOIN   student_parent_links spl ON spl.student_id = s.id AND spl.is_primary = true
       JOIN   parents_guardians pg     ON pg.id = spl.parent_id
       JOIN   schools sc               ON sc.id = s.school_id
       WHERE  s.student_id_number = $1
         AND  s.status = 'active'
         AND  s.deleted_at IS NULL
       LIMIT 1`,
      [student_id.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'STUDENT_NOT_FOUND',
        message: 'Roll number not found or no primary parent on record.',
      });
    }

    const student = result.rows[0];

    const otp = generateOtp();
    storeOtp(student_id.trim(), { otp, student });

    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[DEV] Student OTP for ${student_id}: ${otp}`);
    }

    const mins = process.env.OTP_EXPIRES_MINUTES || 10;
    const smsBody = `ECareAfrica School\n\n${student.full_name} is logging into ECareAfrica.\n\nOTP: ${otp}\n\nValid for ${mins} minutes. Do not share this code.`;
    try {
      await sendSmsRaw(student.parent_phone, smsBody);
      logger.info(`Student OTP sent for ${student_id} to parent ${student.parent_phone.slice(0, 6)}****`);
    } catch (smsErr) {
      logger.warn(`SMS delivery failed for ${student_id}: ${smsErr.message}`);
    }

    res.json({ success: true, message: 'OTP sent to parent phone.' });
  } catch (err) {
    logger.error('requestStudentOtp error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── POST /auth/student/verify-otp ────────────────────────────────────────────
async function verifyStudentOtp(req, res) {
  try {
    const { student_id, otp } = req.body;
    if (!student_id || !otp) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'student_id and otp are required.',
      });
    }

    const { ok, reason, stored } = consumeOtp(student_id.trim(), otp);

    if (!ok) {
      const messages = {
        NO_OTP:  'No OTP found for this student. Please request a new one.',
        EXPIRED: 'OTP has expired. Please request a new one.',
        WRONG:   "Incorrect OTP. Check the SMS sent to your parent's phone.",
      };
      return res.status(401).json({ error: 'OTP_INVALID', message: messages[reason] });
    }

    const { student } = stored;
    const payload = {
      sub:        student.uuid.trim(),
      user_id:    student.uuid.trim(),
      student_id: student.uuid.trim(),
      school_id:  student.school_uuid.trim(),
      role:       'student',
      name:       student.full_name,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    logger.info(`Student JWT issued for ${student.uuid}`);
    res.json({ token, role: 'student', name: student.full_name });
  } catch (err) {
    logger.error('verifyStudentOtp error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── POST /auth/parent/request-otp ────────────────────────────────────────────
async function parentRequestOtp(req, res) {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'phone is required.',
      });
    }

    const result = await queryEca(
      `SELECT u.id, u.uuid, u.school_id, u.name, u.phone, u.role, u.status,
              s.uuid AS school_uuid
       FROM   users u
       JOIN   schools s ON s.id = u.school_id
       WHERE  u.phone = $1
         AND  u.role = 'parent'
         AND  u.deleted_at IS NULL
       LIMIT 1`,
      [phone.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'PARENT_NOT_FOUND',
        message: 'Phone number not registered as a parent.',
      });
    }

    const user = result.rows[0];

    if (user.status !== 'active') {
      return res.status(401).json({
        error: 'ACCOUNT_INACTIVE',
        message: 'Your account is inactive. Contact your school admin.',
      });
    }

    const otp = generateOtp();
    storeOtp(phone.trim(), { otp, user });

    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[DEV] Parent OTP for ${phone}: ${otp}`);
    }

    const mins = process.env.OTP_EXPIRES_MINUTES || 10;
    const smsBody = `ECareAfrica Login\n\nYour one-time password is: ${otp}\n\nValid for ${mins} minutes. Do not share this code with anyone.`;
    try {
      await sendSmsRaw(user.phone, smsBody);
      logger.info(`OTP sent to parent ${user.uuid} (${phone.slice(0, 6)}****)`);
    } catch (smsErr) {
      logger.warn(`SMS delivery failed for ${phone.slice(0, 6)}****: ${smsErr.message}`);
    }

    res.json({ success: true, message: 'OTP sent to your phone.' });
  } catch (err) {
    logger.error('parentRequestOtp error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

module.exports = { login, verifyOtp, parentRequestOtp, requestStudentOtp, verifyStudentOtp };
