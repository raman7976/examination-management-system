import db from '../config/mysql.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sendMail, otpEmail } from '../utils/mailer.js';

// ─────────────────────────────────────────────────────────────────────────────
//  OTP store (in-process). Each entry: { hash, expiresAt, attempts, lastSentAt }.
//  The OTP itself is NEVER stored in plaintext — we keep a SHA-256 hash and
//  compare in constant time. Entries expire (TTL) and are single-use.
//
//  NOTE: this is process-local memory. It's fine for a single instance; if you
//  ever run multiple backend instances, move this to Redis or a DB table.
// ─────────────────────────────────────────────────────────────────────────────
const otpStore = new Map();

const OTP_TTL_MS        = 10 * 60 * 1000; // valid for 10 minutes
const OTP_MAX_ATTEMPTS  = 5;              // wrong tries before the code is burned
const OTP_RESEND_MS     = 60 * 1000;      // min gap between resends (anti-spam)
const MIN_PASSWORD_LEN  = 8;

const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

// Constant-time comparison of two equal-length hex hashes.
const safeEqualHex = (a, b) => {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
};

// Opportunistic cleanup so the Map can't grow unbounded.
const purgeExpiredOtps = () => {
    const now = Date.now();
    for (const [email, e] of otpStore) if (e.expiresAt <= now) otpStore.delete(email);
};

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
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    // Generic response used in EVERY branch below so the endpoint never reveals
    // whether an email is registered (prevents account enumeration).
    const genericOk = () =>
        res.status(200).json({ message: 'If that email is registered, a reset code has been sent.' });

    try {
        purgeExpiredOtps();

        const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (users.length === 0) return genericOk(); // don't disclose non-existence

        // Resend cooldown — quietly succeed without re-sending if too soon.
        const existing = otpStore.get(email);
        if (existing && Date.now() - existing.lastSentAt < OTP_RESEND_MS) return genericOk();

        // Generate a cryptographically-strong 6-digit OTP.
        const otp = String(crypto.randomInt(100000, 1000000));
        otpStore.set(email, {
            hash: hashOtp(otp),
            expiresAt: Date.now() + OTP_TTL_MS,
            attempts: 0,
            lastSentAt: Date.now(),
        });

        try {
            const { subject, text, html } = otpEmail(otp);
            await sendMail({ to: email, subject, text, html });
        } catch (mailErr) {
            // Don't leave a live OTP around if the email never went out.
            otpStore.delete(email);
            console.error('sendOtp mail error:', mailErr.message);
            return res.status(503).json({ message: 'Could not send the reset email right now. Please try again later.' });
        }

        return genericOk();
    } catch (err) {
        console.error('sendOtp error:', err.message);
        return res.status(500).json({ message: 'Failed to send OTP.' });
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
    const email = (req.body?.email || '').trim().toLowerCase();
    const { otp, newPassword } = req.body || {};

    if (!email || !otp || !newPassword)
        return res.status(400).json({ message: 'Email, OTP and new password are required.' });
    if (String(newPassword).length < MIN_PASSWORD_LEN)
        return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LEN} characters.` });

    try {
        purgeExpiredOtps();

        const entry = otpStore.get(email);
        if (!entry || entry.expiresAt <= Date.now()) {
            otpStore.delete(email);
            return res.status(400).json({ message: 'Invalid or expired OTP. Please request a new one.' });
        }

        // Too many wrong tries → burn the code so it can't be brute-forced.
        if (entry.attempts >= OTP_MAX_ATTEMPTS) {
            otpStore.delete(email);
            return res.status(429).json({ message: 'Too many incorrect attempts. Please request a new OTP.' });
        }

        if (!safeEqualHex(entry.hash, hashOtp(otp))) {
            entry.attempts += 1;
            return res.status(400).json({ message: 'Invalid or expired OTP.' });
        }

        // OTP is correct → consume it immediately (single use).
        otpStore.delete(email);

        const hashedPassword = await bcrypt.hash(String(newPassword), 10);
        await db.query('UPDATE users SET password_hash = ? WHERE email = ?', [hashedPassword, email]);

        return res.status(200).json({ message: 'Password reset successful. Please login.' });
    } catch (err) {
        console.error('setNewPassword error:', err.message);
        return res.status(500).json({ message: 'Failed to reset password.' });
    }
};