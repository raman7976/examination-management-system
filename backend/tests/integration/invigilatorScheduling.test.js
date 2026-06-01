// ═════════════════════════════════════════════════════════════════════════════
//  Integration — invigilatorSchedulingController (/api/invigilator-scheduling)
//
//  Period CRUD (createSemester pair / activate-guarded delete), role targets,
//  the in-memory previewSchedule (writes NOTHING), batched applyChanges with the
//  uq_slot_user conflict guard, and getEligibleForSlot's busy/exclude logic.
//
//  Every write passes an explicit period_id (safe lane). The ONE place that must
//  touch the global active flag — deleting the active period (409) — is wrapped in
//  withActivePeriod so the real active period is always restored.
// ═════════════════════════════════════════════════════════════════════════════

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../helpers/app.js';
import { bearer } from '../helpers/auth.js';
import { sweep } from '../helpers/teardown.js';
import db, { closePool } from '../helpers/db.js';
import {
    seedAdmin, seedUser, seedClassroom, seedCourse, seedSlot,
    seedScheduledExam, seedAllocation,
} from '../helpers/seedFixtures.js';
import { createTestPeriod, periodQuery, withActivePeriod } from '../helpers/periodFixture.js';
import { testSemester } from '../fixtures/constants.js';

let admin, periodP, room, u1, u2;

before(async () => {
    admin = await seedAdmin({ local: 'invsched_admin' });
    periodP = await createTestPeriod({ label: 'invP', examType: 'midterm' });
    room = await seedClassroom({ cap_green: 30 });
    u1 = await seedUser({ role: 'faculty', local: 'inv_u1' });
    u2 = await seedUser({ role: 'phd_student', local: 'inv_u2' });

    // A course in the period's semester so getSchedule's room join resolves.
    await seedCourse({ semester_label: periodP.semester_label, code: undefined, name: 'Inv Course', total_students: 30 });
});

after(async () => {
    await sweep('__TEST_');
    await closePool();
});

const auth = () => bearer(admin.token);
const base = '/api/invigilator-scheduling';

// Seed a slot that already has a seating allocation (the precondition the
// scheduler's room-load query needs). Returns { slot, exam, allocation }.
let courseSeq = 0;
async function seatedSlot() {
    courseSeq += 1;
    const { course_code } = await seedCourse({
        semester_label: periodP.semester_label,
        name: `Inv C${courseSeq}`,
        total_students: 30,
    });
    const slot = await seedSlot({ period_id: periodP.id });
    const exam = await seedScheduledExam({ slot_id: slot, course_code });
    const allocation = await seedAllocation({ scheduled_exam_id: exam, classroom_id: room.id, lane: 'G', student_count: 30, room_mode: 'S' });
    return { slot, exam, allocation };
}

// ── semester / period CRUD ──────────────────────────────────────────────────
test('POST /semesters creates a midterm+endterm pair (idempotent)', async () => {
    const label = testSemester('invsem');
    const res = await request(app)
        .post(`${base}/semesters`)
        .set('Authorization', auth())
        .send({ semester_label: label, activate_midterm: false });
    assert.equal(res.status, 201);
    assert.equal(res.body.periods.length, 2);
    const types = res.body.periods.map((p) => p.exam_type).sort();
    assert.deepEqual(types, ['endterm', 'midterm']);

    // Re-create the same semester → no-op.
    const again = await request(app)
        .post(`${base}/semesters`)
        .set('Authorization', auth())
        .send({ semester_label: label, activate_midterm: false });
    assert.equal(again.status, 201);
    assert.equal(again.body.already_existed, true);
});

test('POST /semesters 400s without a label', async () => {
    const res = await request(app)
        .post(`${base}/semesters`)
        .set('Authorization', auth())
        .send({});
    assert.equal(res.status, 400);
});

test('DELETE /exam-periods/:id — 409 active, 200 inactive (cascade), 404 missing', async () => {
    // 409: deleting the period while it is the active one.
    const activeVictim = await createTestPeriod({ label: 'invDelA' });
    await withActivePeriod(activeVictim, async () => {
        const res = await request(app)
            .delete(`${base}/exam-periods/${activeVictim.id}`)
            .set('Authorization', auth());
        assert.equal(res.status, 409, 'cannot delete the active period');
    });

    // 200: an inactive period with a slot → cascades.
    const inactiveVictim = await createTestPeriod({ label: 'invDelI' });
    await seedSlot({ period_id: inactiveVictim.id });
    const ok = await request(app)
        .delete(`${base}/exam-periods/${inactiveVictim.id}`)
        .set('Authorization', auth());
    assert.equal(ok.status, 200);
    assert.equal(ok.body.deleted.slots, 1, 'cascade receipt reports the slot');
    const [gone] = await db.query(`SELECT id FROM exam_periods WHERE id = ?`, [inactiveVictim.id]);
    assert.equal(gone.length, 0, 'period row removed');

    // 404: unknown id.
    const missing = await request(app)
        .delete(`${base}/exam-periods/99999999`)
        .set('Authorization', auth());
    assert.equal(missing.status, 404);
});

// ── role targets ──────────────────────────────────────────────────────────────
test('PUT/GET /role-targets round-trips and validates', async () => {
    const put = await request(app)
        .put(`${base}/role-targets`)
        .set('Authorization', auth())
        .send({ period_id: periodP.id, targets: [{ role: 'faculty', target_duties: 7 }] });
    assert.equal(put.status, 200);

    const get = await request(app)
        .get(periodQuery(`${base}/role-targets`, periodP.id))
        .set('Authorization', auth());
    assert.equal(get.status, 200);
    const fac = get.body.targets.find((t) => t.role === 'faculty');
    assert.equal(Number(fac.target_duties), 7, 'faculty target updated');

    // validation
    const empty = await request(app)
        .put(`${base}/role-targets`)
        .set('Authorization', auth())
        .send({ period_id: periodP.id, targets: [] });
    assert.equal(empty.status, 400);

    const badRole = await request(app)
        .put(`${base}/role-targets`)
        .set('Authorization', auth())
        .send({ period_id: periodP.id, targets: [{ role: 'wizard', target_duties: 1 }] });
    assert.equal(badRole.status, 400);

    const negative = await request(app)
        .put(`${base}/role-targets`)
        .set('Authorization', auth())
        .send({ period_id: periodP.id, targets: [{ role: 'faculty', target_duties: -1 }] });
    assert.equal(negative.status, 400);
});

// ── preview (no DB writes) ──────────────────────────────────────────────────
test('POST /generate-preview returns proposals and writes NOTHING', async () => {
    const { slot } = await seatedSlot();

    const res = await request(app)
        .post(`${base}/generate-preview`)
        .set('Authorization', auth())
        .send({ period_id: periodP.id });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.assignments));
    assert.ok(res.body.summary, 'summary present');
    // The previewed slot is among those considered.
    assert.ok(res.body.assignments.some((a) => a.slot_id === slot), 'seated slot was scheduled');

    // CRITICAL: preview must not persist a single assignment row.
    const [rows] = await db.query(
        `SELECT COUNT(*) c FROM invigilator_assignments WHERE exam_period_id = ?`,
        [periodP.id],
    );
    assert.equal(Number(rows[0].c), 0, 'preview wrote nothing');
});

// ── manual assign / apply-changes / conflict guard ──────────────────────────
test('POST /assignments adds, dedups (409), and feeds reassign/remove via apply-changes', async () => {
    const { slot } = await seatedSlot();

    // add u1
    const add = await request(app)
        .post(`${base}/assignments`)
        .set('Authorization', auth())
        .send({ slot_id: slot, classroom_id: room.id, user_id: u1.id, period_id: periodP.id });
    assert.equal(add.status, 201);
    const assignmentId = add.body.id;

    // duplicate (same slot+user+period) → uq_slot_user guard → 409
    const dup = await request(app)
        .post(`${base}/assignments`)
        .set('Authorization', auth())
        .send({ slot_id: slot, classroom_id: room.id, user_id: u1.id, period_id: periodP.id });
    assert.equal(dup.status, 409);

    // reassign u1 → u2 via apply-changes
    const reassign = await request(app)
        .post(`${base}/apply-changes`)
        .set('Authorization', auth())
        .send({ period_id: periodP.id, reassigns: [{ assignment_id: assignmentId, user_id: u2.id }] });
    assert.equal(reassign.status, 200);
    assert.equal(reassign.body.applied.reassigns, 1);

    // now adding u2 to the same slot conflicts → 409
    const conflict = await request(app)
        .post(`${base}/apply-changes`)
        .set('Authorization', auth())
        .send({ period_id: periodP.id, adds: [{ slot_id: slot, classroom_id: room.id, user_id: u2.id }] });
    assert.equal(conflict.status, 409);

    // remove the assignment
    const remove = await request(app)
        .post(`${base}/apply-changes`)
        .set('Authorization', auth())
        .send({ period_id: periodP.id, removes: [assignmentId] });
    assert.equal(remove.status, 200);
    assert.equal(remove.body.applied.removes, 1);

    const [left] = await db.query(`SELECT id FROM invigilator_assignments WHERE id = ?`, [assignmentId]);
    assert.equal(left.length, 0, 'assignment removed');
});

test('POST /apply-changes with empty payload is a no-op', async () => {
    const res = await request(app)
        .post(`${base}/apply-changes`)
        .set('Authorization', auth())
        .send({ period_id: periodP.id, adds: [], removes: [], reassigns: [] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.applied, { reassigns: 0, removes: 0, adds: 0 });
});

// ── eligibility ─────────────────────────────────────────────────────────────
test('GET /eligible excludes the assigned user and honors exclude_assignment_id', async () => {
    const { slot } = await seatedSlot();
    const add = await request(app)
        .post(`${base}/assignments`)
        .set('Authorization', auth())
        .send({ slot_id: slot, classroom_id: room.id, user_id: u1.id, period_id: periodP.id });
    const assignmentId = add.body.id;

    // u1 is busy in this slot → excluded from the eligible pool.
    const eligible = await request(app)
        .get(`${base}/eligible?slot_id=${slot}&period_id=${periodP.id}`)
        .set('Authorization', auth());
    assert.equal(eligible.status, 200);
    assert.ok(!eligible.body.eligible.some((e) => e.user_id === u1.id), 'assigned user excluded');

    // …but excluding their own assignment brings them back (the reassign use-case).
    const withExclude = await request(app)
        .get(`${base}/eligible?slot_id=${slot}&period_id=${periodP.id}&exclude_assignment_id=${assignmentId}`)
        .set('Authorization', auth());
    assert.ok(withExclude.body.eligible.some((e) => e.user_id === u1.id), 'self-exclusion re-admits the user');

    // missing slot_id → 400
    const noSlot = await request(app)
        .get(`${base}/eligible?period_id=${periodP.id}`)
        .set('Authorization', auth());
    assert.equal(noSlot.status, 400);
});
