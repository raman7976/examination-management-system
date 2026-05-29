import express from 'express';
import { login, sendOtp, setNewPassword, getMe } from '../controllers/userController.js';
import { protect } from '../middleware/middleware1.js';

const router = express.Router();

router.post('/login', login);
router.post('/send-otp', sendOtp);
router.post('/reset-password', setNewPassword);
router.get('/me', protect, getMe);


export default router;