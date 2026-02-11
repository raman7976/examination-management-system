import express from 'express';
import { login, sendOtp, setNewPassword } from '../controllers/userController.js';

const router = express.Router();

router.post('/login', login);
router.post('/send-otp', sendOtp);
router.post('/reset-password', setNewPassword);

export default router;