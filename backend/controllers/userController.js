import db from '../config/mysql.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const otpStore = {}; // Temporary memory for OTPs

export const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        // 1. Fetch user from DB
        const [users] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
        
        if (users.length === 0) {
            return res.status(404).json({ message: "User not registered" });
        }

        const user = users[0];

        // 2. CHECK: Use password_hash (matching your DB screenshot)
        if (!user.password_hash) {
            return res.status(400).json({ 
                message: "Account exists but password is not set. Please use 'Forgot Password' to setup." 
            });
        }

        // 3. COMPARE: Use password_hash for bcrypt
        const isMatch = await bcrypt.compare(password, user.password_hash);
        
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // 4. GENERATE TOKEN: Standard SDE practice
        const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
           process.env.JWT_SECRET, // <--- Pulling the secret from the .env file
         { expiresIn: '8h' }
         );
        res.status(200).json({
            message: "Login successful",
            token,
            user: { id: user.id, name: user.full_name, email: user.email, role: user.role }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const sendOtp = async (req, res) => {
    const { email } = req.body;
    try {
        const [users] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
        if (users.length === 0) return res.status(404).json({ message: "User not registered" });

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000);
        otpStore[email] = otp; 
        
        console.log(`📩 [DEBUG] OTP for ${email}: ${otp}`); 
        
        res.status(200).json({ message: "OTP sent to console" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /v1/user/me — returns the full profile of the authenticated user.
// Used by the Profile tab of the invigilator portal (which needs employee_id +
// department + created_at) since the JWT only carries id / email / role.
export const getMe = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, full_name, email, role, employee_id, department, created_at
             FROM users WHERE id = ?`,
            [req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, user: rows[0] });
    } catch (err) {
        console.error('getMe error:', err);
        res.status(500).json({ success: false, message: 'Failed to load profile.' });
    }
};

export const setNewPassword = async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
        // Verify OTP from memory
        if (!otpStore[email] || otpStore[email] != otp) {
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // UPDATE: Match the column name 'password_hash' from your DB
        await db.query("UPDATE users SET password_hash = ? WHERE email = ?", [hashedPassword, email]);
        
        delete otpStore[email]; // Clear OTP after success
        res.status(200).json({ message: "Password reset successful. Please login." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};