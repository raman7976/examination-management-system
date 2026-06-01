// ═════════════════════════════════════════════════════════════════════════════
//  Auth helpers for integration tests.
//
//  mintToken() forges the EXACT JWT the real login path issues
//  (userController.js:65 — { id, email, role }, 8h expiry, signed with
//  process.env.JWT_SECRET). `protect` middleware only verifies the signature and
//  never hits the DB, so a minted token authenticates instantly — which lets us
//  avoid the loginLimiter on every request. One dedicated auth test still drives
//  the real bcrypt + /login path end-to-end.
//
//  bearer() returns the Authorization header value; authGet/authPost/etc. are
//  thin supertest wrappers that attach it.
// ═════════════════════════════════════════════════════════════════════════════

import 'dotenv/config';
import jwt from 'jsonwebtoken';

export function mintToken({ id, email, role }) {
    return jwt.sign({ id, email, role }, process.env.JWT_SECRET, { expiresIn: '8h' });
}

// An obviously-invalid token signed with the WRONG secret — used to assert 401s.
export function badToken({ id = 1, email = 'x@test.invalid', role = 'admin' } = {}) {
    return jwt.sign({ id, email, role }, 'definitely-not-the-real-secret', { expiresIn: '8h' });
}

// A token that is already expired (for the "expired → 401" case).
export function expiredToken({ id = 1, email = 'x@test.invalid', role = 'admin' } = {}) {
    return jwt.sign({ id, email, role }, process.env.JWT_SECRET, { expiresIn: -10 });
}

export const bearer = (token) => `Bearer ${token}`;
