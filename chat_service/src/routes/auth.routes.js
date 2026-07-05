const express = require('express');
const router  = express.Router();
const authController = require('../controllers/auth.controller');

// ── Teacher / Parent authentication ──────────────────────────────────────────
router.post('/login',       authController.login);
router.post('/verify-otp',  authController.verifyOtp);

// ── Student authentication (OTP via parent phone) ─────────────────────────────
router.post('/student/request-otp', authController.requestStudentOtp);
router.post('/student/verify-otp',  authController.verifyStudentOtp);

module.exports = router;
