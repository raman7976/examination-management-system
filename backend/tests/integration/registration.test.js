// ═════════════════════════════════════════════════════════════════════════════
//  Integration — registrationController (/api/registration)
//
//  Drives the exported app in-process via supertest against the LIVE DB. Every
//  row is __TEST_-tagged; the after() hook sweeps this run's rows and closes the
//  pool. Admin auth uses a minted token whose id matches a real seeded admin row
//  (deleteInvigilator compares req.user.id, so the id must be real).
// ═════════════════════════════════════════════════════════════════════════════

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../helpers/app.js';
import { bearer } from '../helpers/auth.js';
import { sweep } from '../helpers/teardown.js';
import { closePool } from '../helpers/db.js';
import { seedAdmin, seedUser } from '../helpers/seedFixtures.js';
import { testEmail, testEmpId } from '../fixtures/constants.js';

let admin;

before(async () => {
    admin = await seedAdmin({ local: 'reg_admin' });
});

after(async () => {
    await sweep('__TEST_');
    await closePool();
});

const auth = () => bearer(admin.token);

// ── public template ──────────────────────────────────────────────────────────
test('GET /template streams an .xlsx with no auth', async () => {
    const res = await request(app).get('/api/registration/template');
    assert.equal(res.status, 200);
    assert.match(
        res.headers['content-type'],
        /spreadsheetml\.sheet/,
        'served as an xlsx workbook',
    );
    assert.match(
        res.headers['content-disposition'],
        /attachment;.*\.xlsx/,
        'served as a downloadable .xlsx attachment',
    );
});

// ── auth gates ────────────────────────────────────────────────────────────────
test('protected routes reject missing / non-admin tokens', async () => {
    const noTok = await request(app).get('/api/registration/invigilators');
    assert.equal(noTok.status, 401);

    const fac = await seedUser({ role: 'faculty', local: 'reg_fac_gate' });
    const forbidden = await request(app)
        .get('/api/registration/invigilators')
        .set('Authorization', bearer(fac.token));
    assert.equal(forbidden.status, 403, 'faculty cannot reach admin route');
});

// ── single register ───────────────────────────────────────────────────────────
test('POST /register creates an invigilator (201) and rejects duplicates', async () => {
    const email = testEmail('reg_one');
    const employee_id = testEmpId('REG1');

    const ok = await request(app)
        .post('/api/registration/register')
        .set('Authorization', auth())
        .send({ name: 'Reg One', email, role: 'faculty', employee_id, department: 'CSE' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.success, true);

    // duplicate email → 409
    const dupEmail = await request(app)
        .post('/api/registration/register')
        .set('Authorization', auth())
        .send({ name: 'Reg One Again', email, role: 'phd_student', employee_id: testEmpId('REG1b') });
    assert.equal(dupEmail.status, 409);

    // duplicate employee_id → 409
    const dupEmp = await request(app)
        .post('/api/registration/register')
        .set('Authorization', auth())
        .send({ name: 'Reg Two', email: testEmail('reg_two'), role: 'faculty', employee_id });
    assert.equal(dupEmp.status, 409);
});

test('POST /register validates role and required fields', async () => {
    const missing = await request(app)
        .post('/api/registration/register')
        .set('Authorization', auth())
        .send({ email: testEmail('reg_missing'), role: 'faculty' }); // no name
    assert.equal(missing.status, 400);

    const badRole = await request(app)
        .post('/api/registration/register')
        .set('Authorization', auth())
        .send({ name: 'Bad Role', email: testEmail('reg_badrole'), role: 'wizard' });
    assert.equal(badRole.status, 400);
});

// ── bulk upload ─────────────────────────────────────────────────────────────
test('POST /bulk-upload inserts new rows, skips duplicates and flags bad roles', async () => {
    const { invigilatorsXlsx } = await import('../helpers/xlsxBuilders.js');
    const e1 = testEmail('bulk1');
    const e2 = testEmail('bulk2');

    const buf = await invigilatorsXlsx([
        { employeeId: testEmpId('BULK1'), name: 'Bulk One', email: e1, role: 'faculty', department: 'CSE' },
        { employeeId: testEmpId('BULK2'), name: 'Bulk Two', email: e2, role: 'phd_student' },
        { employeeId: testEmpId('BULK3'), name: 'Bulk Bad', email: testEmail('bulk3'), role: 'wizard' }, // bad role
    ]);

    const res = await request(app)
        .post('/api/registration/bulk-upload')
        .set('Authorization', auth())
        .attach('file', buf, 'invigilators.xlsx');

    assert.equal(res.status, 200);
    assert.equal(res.body.inserted, 2, 'two valid rows inserted');
    assert.equal(res.body.errors.length, 1, 'bad role reported as an error');

    // Re-upload the same file → the two valid rows are now skipped (INSERT IGNORE).
    const reupload = await request(app)
        .post('/api/registration/bulk-upload')
        .set('Authorization', auth())
        .attach('file', buf, 'invigilators.xlsx');
    assert.equal(reupload.status, 200);
    assert.equal(reupload.body.inserted, 0, 'no new rows on re-upload');
    assert.equal(reupload.body.skipped, 2, 'both existing rows skipped');
});

// ── list + search ─────────────────────────────────────────────────────────────
test('GET /invigilators lists non-admins and honors search', async () => {
    await seedUser({ role: 'lab_staff', local: 'search_target', fullName: 'Zztest Searchable' });

    const all = await request(app)
        .get('/api/registration/invigilators')
        .set('Authorization', auth());
    assert.equal(all.status, 200);
    assert.ok(Array.isArray(all.body.invigilators));
    assert.ok(all.body.invigilators.every((u) => u.role !== 'admin'), 'admins excluded');

    const filtered = await request(app)
        .get('/api/registration/invigilators?search=Zztest Searchable')
        .set('Authorization', auth());
    assert.equal(filtered.status, 200);
    assert.ok(filtered.body.invigilators.some((u) => u.full_name === 'Zztest Searchable'));
});

// ── delete rules ────────────────────────────────────────────────────────────
test('DELETE /invigilators enforces self / admin / not-found rules', async () => {
    // delete self → 400
    const self = await request(app)
        .delete(`/api/registration/invigilators/${admin.id}`)
        .set('Authorization', auth());
    assert.equal(self.status, 400);

    // delete another admin → 403
    const otherAdmin = await seedAdmin({ local: 'reg_other_admin' });
    const adminDel = await request(app)
        .delete(`/api/registration/invigilators/${otherAdmin.id}`)
        .set('Authorization', auth());
    assert.equal(adminDel.status, 403);

    // delete a real invigilator → 200
    const victim = await seedUser({ role: 'faculty', local: 'reg_victim' });
    const ok = await request(app)
        .delete(`/api/registration/invigilators/${victim.id}`)
        .set('Authorization', auth());
    assert.equal(ok.status, 200);

    // delete missing id → 404
    const missing = await request(app)
        .delete('/api/registration/invigilators/99999999')
        .set('Authorization', auth());
    assert.equal(missing.status, 404);
});
