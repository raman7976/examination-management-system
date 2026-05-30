import express from 'express';
import { login, sendOtp, setNewPassword, getMe } from '../controllers/userController.js';
import { protect } from '../middleware/middleware1.js';
import { loginLimiter, otpRequestLimiter, resetLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/login', loginLimiter, login);
router.post('/send-otp', otpRequestLimiter, sendOtp);
router.post('/reset-password', resetLimiter, setNewPassword);
router.get('/me', protect, getMe);


export default router;