// ═════════════════════════════════════════════════════════════════════════════
//  Integration — examController Phase 1 (exam slots, /api/exams)
//
//  All slot endpoints resolve the period from an explicit period_id (query/body),
//  so they ride resolveActivePeriod's safe lane and never touch the global active
//  flag. Covers create/list/update/delete, the 400/404 guards, and cross-period
//  isolation (period B must never see period A's slots).
// ═════════════════════════════════════════════════════════════════════════════

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../helpers/app.js';
import { bearer } from '../helpers/auth.js';
import { sweep } from '../helpers/teardown.js';
import { closePool } from '../helpers/db.js';
import { seedAdmin } from '../helpers/seedFixtures.js';
import { createTestPeriod, periodQuery } from '../helpers/periodFixture.js';

let admin, periodA, periodB;

before(async () => {
    admin = await seedAdmin({ local: 'slots_admin' });
    periodA = await createTestPeriod({ label: 'slotsA' });
    periodB = await createTestPeriod({ label: 'slotsB' });
});

after(async () => {
    await sweep('__TEST_');
    await closePool();
});

const auth = () => bearer(admin.token);

test('POST /add-batch-slots inserts slots into the given period', async () => {
    const res = await request(app)
        .post('/api/exams/add-batch-slots')
        .set('Authorization', auth())
        .send({
            period_id: periodA.id,
            slots: [
                { date: '2099-03-01', day: 'Monday', startTime: '09:00:00', endTime: '12:00:00' },
                { date: '2099-03-01', day: 'Monday', startTime: '14:00:00', endTime: '17:00:00' },
            ],
        });
    assert.equal(res.status, 201);
    assert.match(res.body.message, /2 exam slots/);
});

test('POST /add-batch-slots rejects an empty payload (400)', async () => {
    const res = await request(app)
        .post('/api/exams/add-batch-slots')
        .set('Authorization', auth())
        .send({ period_id: periodA.id, slots: [] });
    assert.equal(res.status, 400);
});

test('GET /available-slots is period-scoped (no cross-period leak)', async () => {
    const a = await request(app)
        .get(periodQuery('/api/exams/available-slots', periodA.id))
        .set('Authorization', auth());
    assert.equal(a.status, 200);
    assert.equal(a.body.length, 2, 'period A has its 2 slots');

    const b = await request(app)
        .get(periodQuery('/api/exams/available-slots', periodB.id))
        .set('Authorization', auth());
    assert.equal(b.status, 200);
    assert.equal(b.body.length, 0, 'period B is empty — no leak from A');
});

test('PUT /slots/:id updates within its period and 404s across periods', async () => {
    const list = await request(app)
        .get(periodQuery('/api/exams/available-slots', periodA.id))
        .set('Authorization', auth());
    const slotId = list.body[0].id;

    const ok = await request(app)
        .put(`/api/exams/slots/${slotId}`)
        .set('Authorization', auth())
        .send({ period_id: periodA.id, exam_date: '2099-03-02', exam_day: 'Tuesday', start_time: '10:00:00', end_time: '13:00:00' });
    assert.equal(ok.status, 200);

    // missing fields → 400
    const bad = await request(app)
        .put(`/api/exams/slots/${slotId}`)
        .set('Authorization', auth())
        .send({ period_id: periodA.id, exam_date: '2099-03-02' });
    assert.equal(bad.status, 400);

    // same slot id but scoped to the WRONG period → 404
    const wrongPeriod = await request(app)
        .put(`/api/exams/slots/${slotId}`)
        .set('Authorization', auth())
        .send({ period_id: periodB.id, exam_date: '2099-03-02', exam_day: 'Tuesday', start_time: '10:00:00', end_time: '13:00:00' });
    assert.equal(wrongPeriod.status, 404);
});

test('DELETE /slots/:id removes one slot; DELETE /slots clears the period', async () => {
    const list = await request(app)
        .get(periodQuery('/api/exams/available-slots', periodA.id))
        .set('Authorization', auth());
    const [first] = list.body;

    // wrong period → 404
    const wrong = await request(app)
        .delete(periodQuery(`/api/exams/slots/${first.id}`, periodB.id))
        .set('Authorization', auth());
    assert.equal(wrong.status, 404);

    // correct period → 200
    const ok = await request(app)
        .delete(periodQuery(`/api/exams/slots/${first.id}`, periodA.id))
        .set('Authorization', auth());
    assert.equal(ok.status, 200);

    // delete-all for the period
    const all = await request(app)
        .delete(periodQuery('/api/exams/slots', periodA.id))
        .set('Authorization', auth());
    assert.equal(all.status, 200);

    const after = await request(app)
        .get(periodQuery('/api/exams/available-slots', periodA.id))
        .set('Authorization', auth());
    assert.equal(after.body.length, 0, 'period A fully cleared');
});
