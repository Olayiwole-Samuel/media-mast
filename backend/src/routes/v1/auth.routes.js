const express = require('express');
const {
    register,
    login,
    getMe,
    logout,
    changePassword,
    forgotPassword,
    resetPassword,
    acceptInvite,
} = require('../../controllers/auth.controller');
const { protect } = require('../../middleware/auth');
const {
    validateRegister,
    validateLogin,
    validateChangePassword,
    validateForgotPassword,
    validateResetPassword,
    validateAcceptInvite,
} = require('../../validators/auth.validator');
const {
    loginLimiter,
    registerLimiter,
    forgotPasswordLimiter,
    resetPasswordLimiter,
    acceptInviteLimiter,
    changePasswordLimiter,
} = require('../../middleware/rateLimit');

const router = express.Router();

// ── Public Routes ──
router.post('/register', registerLimiter, validateRegister, register);
router.post('/login', loginLimiter, validateLogin, login);
router.post('/forgot-password', forgotPasswordLimiter, validateForgotPassword, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, validateResetPassword, resetPassword);
router.post('/invite/accept', acceptInviteLimiter, validateAcceptInvite, acceptInvite);

// ── Protected Routes ──
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.patch('/password', protect, changePasswordLimiter, validateChangePassword, changePassword);

module.exports = router;
