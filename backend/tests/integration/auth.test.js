// ═════════════════════════════════════════════════════════════════════════════
//  Integration — userController + auth middleware (/api/v1/user)
//
//  Exercises the ONE real bcrypt + /login round-trip (every other suite mints
//  tokens to dodge the loginLimiter), the JWT claim shape, /me, the protect /
//  requireAdmin / requireInvigilator gates, and the enumeration-safe OTP
//  branches that DON'T require SMTP (unknown-email + reset-password validation).
//
//  Login is called <10 times to stay under loginLimiter (10 / 15 min / IP).
// ═════════════════════════════════════════════════════════════════════════════

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import app from '../helpers/app.js';
import { bearer, mintToken, badToken, expiredToken } from '../helpers/auth.js';
import { sweep } from '../helpers/teardown.js';
import { closePool } from '../helpers/db.js';
import { seedAdmin, seedUser } from '../helpers/seedFixtures.js';
import { TEST_PASSWORD, testEmail } from '../fixtures/constants.js';

let admin, noPwUser;

before(async () => {
    admin = await seedAdmin({ local: 'auth_admin' });
    noPwUser = await seedUser({ role: 'faculty', local: 'auth_nopw', withPassword: false });
});

after(async () => {
    await sweep('__TEST_');
    await closePool();
});

// ── /login ────────────────────────────────────────────────────────────────
test('POST /login returns a JWT with {id,email,role} and 8h expiry', async () => {
    const res = await request(app)
        .post('/api/v1/user/login')
        .send({ email: admin.email, password: TEST_PASSWORD });

    assert.equal(res.status, 200);
    assert.ok(res.body.token, 'token issued');

    const claims = jwt.decode(res.body.token);
    assert.equal(claims.id, admin.id);
    assert.equal(claims.email, admin.email);
    assert.equal(claims.role, 'admin');
    assert.equal(claims.exp - claims.iat, 8 * 60 * 60, 'expires in 8 hours');

    assert.equal(res.body.user.role, 'admin');
});

test('POST /login → 404 unknown, 400 no-password, 401 wrong-password', async () => {
    const unknown = await request(app)
        .post('/api/v1/user/login')
        .send({ email: testEmail('auth_ghost'), password: TEST_PASSWORD });
    assert.equal(unknown.status, 404);

    const noPw = await request(app)
        .post('/api/v1/user/login')
        .send({ email: noPwUser.email, password: TEST_PASSWORD });
    assert.equal(noPw.status, 400, 'account exists but no password set');

    const wrongPw = await request(app)
        .post('/api/v1/user/login')
        .send({ email: admin.email, password: 'WrongPassword!' });
    assert.equal(wrongPw.status, 401);
});

// ── /me + protect ─────────────────────────────────────────────────────────
test('GET /me returns the profile for a valid token and 401s otherwise', async () => {
    const ok = await request(app)
        .get('/api/v1/user/me')
        .set('Authorization', bearer(admin.token));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.id, admin.id);
    assert.equal(ok.body.user.email, admin.email);
    assert.ok('employee_id' in ok.body.user, '/me exposes employee_id (not in the JWT)');

    assert.equal((await request(app).get('/api/v1/user/me')).status, 401, 'no token');
    assert.equal(
        (await request(app).get('/api/v1/user/me').set('Authorization', 'Bearer not-a-jwt')).status,
        401, 'malformed token',
    );
    assert.equal(
        (await request(app).get('/api/v1/user/me').set('Authorization', bearer(badToken({ id: admin.id })))).status,
        401, 'wrong-signature token',
    );
    assert.equal(
        (await request(app).get('/api/v1/user/me').set('Authorization', bearer(expiredToken({ id: admin.id })))).status,
        401, 'expired token',
    );
});

// ── role gates ──────────────────────────────────────────────────────────────
test('requireAdmin / requireInvigilator block the wrong role', async () => {
    const faculty = await seedUser({ role: 'faculty', local: 'auth_role_fac' });

    // admin route with an invigilator token → 403
    const adminRouteAsFaculty = await request(app)
        .get('/api/registration/invigilators')
        .set('Authorization', bearer(faculty.token));
    assert.equal(adminRouteAsFaculty.status, 403);

    // invigilator route with an admin token → 403
    const inviRouteAsAdmin = await request(app)
        .get('/api/invigilator-scheduling/my-schedule')
        .set('Authorization', bearer(admin.token));
    assert.equal(inviRouteAsAdmin.status, 403);
});

// ── OTP — SMTP-free branches ─────────────────────────────────────────────────
test('OTP endpoints are enumeration-safe and validate input', async () => {
    // missing email → 400
    const noEmail = await request(app).post('/api/v1/user/send-otp').send({});
    assert.equal(noEmail.status, 400);

    // unknown email → generic 200 (no mail attempted, no disclosure)
    const unknown = await request(app)
        .post('/api/v1/user/send-otp')
        .send({ email: testEmail('auth_otp_ghost') });
    assert.equal(unknown.status, 200);
    assert.match(unknown.body.message, /if that email is registered/i);

    // reset-password validation (no live OTP needed)
    const missing = await request(app).post('/api/v1/user/reset-password').send({ email: admin.email });
    assert.equal(missing.status, 400);

    const shortPw = await request(app)
        .post('/api/v1/user/reset-password')
        .send({ email: admin.email, otp: '123456', newPassword: 'short' });
    assert.equal(shortPw.status, 400, 'password < 8 chars rejected');

    const noOtp = await request(app)
        .post('/api/v1/user/reset-password')
        .send({ email: admin.email, otp: '123456', newPassword: 'LongEnoughPass1' });
    assert.equal(noOtp.status, 400, 'no OTP on record → invalid/expired');
});
