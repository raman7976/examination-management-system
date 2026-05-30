import rateLimit from 'express-rate-limit';

// ─────────────────────────────────────────────────────────────────────────────
//  Rate limiters for sensitive auth endpoints. Keyed by client IP. These cap
//  brute-force (login) and OTP-spam (send-otp / reset-password) without
//  affecting normal usage.
//
//  `standardHeaders` emits RateLimit-* headers so clients can back off; we
//  disable the legacy X-RateLimit-* set.
// ─────────────────────────────────────────────────────────────────────────────

const common = {
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please wait a moment and try again.' },
};

// Login: 10 attempts / 15 min / IP.
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    ...common,
});

// OTP request: 5 / 15 min / IP (the per-email resend cooldown adds a second layer).
export const otpRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    ...common,
});

// Password reset (OTP verification): 10 / 15 min / IP.
export const resetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    ...common,
});
