const express = require('express');
const router  = express.Router();
const authController = require('../controllers/auth.controller');

// ── Teacher authentication (phone + password → OTP) ──────────────────────────
router.post('/login',       authController.login);
router.post('/verify-otp',  authController.verifyOtp);

// ── Parent authentication (phone only → OTP) ─────────────────────────────────
router.post('/parent/request-otp', authController.parentRequestOtp);
// verify-otp is shared — parent uses POST /auth/verify-otp with { phone, otp }

// ── Student authentication (roll number → OTP to parent phone) ────────────────
router.post('/student/request-otp', authController.requestStudentOtp);
router.post('/student/verify-otp',  authController.verifyStudentOtp);

module.exports = router;
