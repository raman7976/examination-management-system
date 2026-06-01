// ═════════════════════════════════════════════════════════════════════════════
//  Integration — examSessionController (/api/seating/sessions)
//
//  Snapshot the live seating into an immutable exam_sessions row (+ per-seat
//  rows), list, get-by-id, delete. The save GATHERS only the resolved period's
//  seating — so a save for period A must NOT archive period B's rows. Every save
//  passes an explicit period_id (safe lane) and tags academic_year with
//  TEST_PREFIX so teardown's exam_sessions sweep reclaims it.
// ═════════════════════════════════════════════════════════════════════════════

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../helpers/app.js';
import { bearer } from '../helpers/auth.js';
import { sweep } from '../helpers/teardown.js';
import db, { closePool } from '../helpers/db.js';
import {
    seedAdmin, seedClassroom, seedCourse, seedSlot,
    seedScheduledExam, seedAllocation, seedStudent,
} from '../helpers/seedFixtures.js';
import { createTestPeriod } from '../helpers/periodFixture.js';
import { RUN_TAG } from '../fixtures/constants.js';

// exam_sessions.academic_year is varchar(10); the teardown sweeps it by the
// broad '__TEST_%' prefix, so a 7-char prefix + short run tag (≤10 total) both
// fits the column AND stays reclaimable.
const ACADEMIC_YEAR = (`__TEST_${RUN_TAG}`).slice(0, 10);

let admin, periodA, periodB, room, rollA, rollB;

// Seed a full seating chain (course → slot → scheduled_exam → allocation →
// student → individual_seating_plan) into a period. Returns the roll seated.
// NB: exam_session_seating.course_code is varchar(20) (narrower than
// courses.course_code), so we use a SHORT __TEST_-tagged code that still fits
// the snapshot column and is reclaimed by the teardown's course sweep.
let seatSeq = 0;
async function seatOne(period, seatLabel) {
    seatSeq += 1;
    const code = `__TEST_SS${seatSeq}`.slice(0, 20);
    const { course_code } = await seedCourse({ semester_label: period.semester_label, code, total_students: 1 });
    const slot = await seedSlot({ period_id: period.id });
    const exam = await seedScheduledExam({ slot_id: slot, course_code });
    const allocation = await seedAllocation({ scheduled_exam_id: exam, classroom_id: room.id, lane: 'G', student_count: 1, room_mode: 'S' });
    const roll = await seedStudent();
    await db.query(
        `INSERT INTO individual_seating_plans (allocation_id, roll_number, seat_number) VALUES (?, ?, ?)`,
        [allocation, roll, seatLabel],
    );
    return roll;
}

before(async () => {
    admin = await seedAdmin({ local: 'sess_admin' });
    periodA = await createTestPeriod({ label: 'sessA' });
    periodB = await createTestPeriod({ label: 'sessB' });
    room = await seedClassroom({ room_name: 'SESSR1' });

    // Both periods carry one seated student — B's presence proves the save is
    // period-scoped (A's snapshot must never include B's roll).
    rollA = await seatOne(periodA, 'G1');
    rollB = await seatOne(periodB, 'G2');
});

after(async () => {
    await sweep('__TEST_');
    await closePool();
});

const auth = () => bearer(admin.token);
const base = '/api/seating';
// academic_year carries the __TEST_ prefix so the teardown's exam_sessions sweep
// finds it; both it and semester_type must fit varchar(10).
const meta = (extra = {}) => ({
    exam_type: 'midterm',
    semester_type: 'Odd',
    academic_year: ACADEMIC_YEAR,
    ...extra,
});

test('POST /sessions/save 400s without the required metadata', async () => {
    const res = await request(app)
        .post(`${base}/sessions/save`)
        .set('Authorization', auth())
        .send({ period_id: periodA.id }); // no exam_type/semester_type/academic_year
    assert.equal(res.status, 400);
});

test('POST /sessions/save 404s when the period has no seating', async () => {
    const empty = await createTestPeriod({ label: 'sessEmpty' });
    const res = await request(app)
        .post(`${base}/sessions/save`)
        .set('Authorization', auth())
        .send(meta({ period_id: empty.id }));
    assert.equal(res.status, 404, 'nothing seated → nothing to archive');
});

test('POST /sessions/save archives ONLY the resolved period (A), not B', async () => {
    const res = await request(app)
        .post(`${base}/sessions/save`)
        .set('Authorization', auth())
        .send(meta({ period_id: periodA.id }));
    assert.equal(res.status, 201);
    const sessionId = res.body.session_id;
    assert.ok(sessionId, 'session id returned');

    // The snapshot holds A's roll and NOT B's — proof the gather is period-scoped.
    const get = await request(app)
        .get(`${base}/sessions/${sessionId}`)
        .set('Authorization', auth());
    assert.equal(get.status, 200);
    const rolls = get.body.data.map((r) => r.roll_number);
    assert.ok(rolls.includes(rollA), 'period A roll archived');
    assert.ok(!rolls.includes(rollB), 'period B roll NOT archived (period-scoped gather)');
    assert.equal(get.body.session.total_students, rolls.length, 'metadata total matches row count');
});

test('GET /sessions lists the saved session; GET /sessions/:id 404s on unknown', async () => {
    // Save one so the list is non-empty for this run.
    const saved = await request(app)
        .post(`${base}/sessions/save`)
        .set('Authorization', auth())
        .send(meta({ period_id: periodA.id }));
    const sessionId = saved.body.session_id;

    const list = await request(app)
        .get(`${base}/sessions`)
        .set('Authorization', auth());
    assert.equal(list.status, 200);
    assert.ok(list.body.sessions.some((s) => s.id === sessionId), 'saved session in the list');

    const missing = await request(app)
        .get(`${base}/sessions/99999999`)
        .set('Authorization', auth());
    assert.equal(missing.status, 404);
});

test('DELETE /sessions/:id removes the session (and 404s when already gone)', async () => {
    const saved = await request(app)
        .post(`${base}/sessions/save`)
        .set('Authorization', auth())
        .send(meta({ period_id: periodA.id }));
    const sessionId = saved.body.session_id;

    const del = await request(app)
        .delete(`${base}/sessions/${sessionId}`)
        .set('Authorization', auth());
    assert.equal(del.status, 200);

    // Gone now → get-by-id 404, second delete 404.
    const get = await request(app)
        .get(`${base}/sessions/${sessionId}`)
        .set('Authorization', auth());
    assert.equal(get.status, 404);

    const delAgain = await request(app)
        .delete(`${base}/sessions/${sessionId}`)
        .set('Authorization', auth());
    assert.equal(delAgain.status, 404);
});
