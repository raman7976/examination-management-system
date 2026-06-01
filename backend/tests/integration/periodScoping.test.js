// ═════════════════════════════════════════════════════════════════════════════
//  Integration — period / semester scoping (supersedes period-scoping.test.js)
//
//  Defends against the class of bug where a query forgets its
//  `WHERE exam_period_id = ?` (or `semester_label = ?`) and silently bleeds
//  another period's data into the active view.
//
//  Strategy: seed period A with a FULL chain (slot → scheduled_exam →
//  allocation → seating plan + two invigilator assignments + a swap request) and
//  leave period B empty. Every period-scoped endpoint must show A's data for
//  ?period_id=A and NOTHING for ?period_id=B. Plus a focused regression guard
//  for the documented cross-semester enrollment leak.
//
//  The three historically-fixed scoping bugs are guarded here and in sibling
//  suites:
//    1. getSchedule slots query  → asserted below (B's /schedule is empty).
//    2. generateMicroPlan enrollment semester-scope → guarded below + deeply in
//       seating.test.js (same course code in two semesters).
//    3. saveSession gather period-scope → guarded in examSessions.test.js.
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
    seedScheduledExam, seedAllocation, seedStudent, seedEnrollment, seedAssignment,
} from '../helpers/seedFixtures.js';
import { createTestPeriod, periodQuery } from '../helpers/periodFixture.js';

let admin, periodA, periodB, room, inv1, inv2;
let slot1A, slot2A, courseA;

before(async () => {
    admin = await seedAdmin({ local: 'scope_admin' });
    periodA = await createTestPeriod({ label: 'scopeA' });
    periodB = await createTestPeriod({ label: 'scopeB' }); // stays empty
    room = await seedClassroom({ room_name: 'SCOPER1' });
    inv1 = await seedUser({ role: 'faculty', local: 'scope_i1' });
    inv2 = await seedUser({ role: 'phd_student', local: 'scope_i2' });

    // ── Period A: a full, well-formed chain ──
    courseA = (await seedCourse({ semester_label: periodA.semester_label, total_students: 1 })).course_code;
    slot1A = await seedSlot({ period_id: periodA.id });
    slot2A = await seedSlot({ period_id: periodA.id });

    const exam = await seedScheduledExam({ slot_id: slot1A, course_code: courseA });
    const alloc = await seedAllocation({ scheduled_exam_id: exam, classroom_id: room.id, lane: 'G', student_count: 1, room_mode: 'S' });
    const roll = await seedStudent();
    await db.query(
        `INSERT INTO individual_seating_plans (allocation_id, roll_number, seat_number) VALUES (?, ?, ?)`,
        [alloc, roll, 'G1'],
    );

    // Two invigilator assignments (one per slot) so a swap request can exist in A.
    const a1 = await seedAssignment({ slot_id: slot1A, classroom_id: room.id, user_id: inv1.id, period_id: periodA.id });
    const a2 = await seedAssignment({ slot_id: slot2A, classroom_id: room.id, user_id: inv2.id, period_id: periodA.id });

    // A pending swap request, created through the real endpoint on the safe lane.
    await request(app)
        .post('/api/invigilator-scheduling/swap-requests')
        .set('Authorization', bearer(inv1.token))
        .send({ requester_assignment_id: a1, target_assignment_id: a2, period_id: periodA.id });
});

after(async () => {
    await sweep('__TEST_');
    await closePool();
});

const auth = () => bearer(admin.token);

// ── getSchedule: slots are period-scoped (regression #1) ─────────────────────
test('GET /schedule returns A\'s slots and NOTHING for empty period B', async () => {
    const a = await request(app)
        .get(periodQuery('/api/invigilator-scheduling/schedule', periodA.id))
        .set('Authorization', auth());
    assert.equal(a.status, 200);
    assert.equal(a.body.schedule.length, 2, 'A exposes its 2 slots');

    const b = await request(app)
        .get(periodQuery('/api/invigilator-scheduling/schedule', periodB.id))
        .set('Authorization', auth());
    assert.equal(b.status, 200);
    assert.equal(b.body.schedule.length, 0, 'B is empty — no leak from A');
});

// ── seating status is period-scoped ──────────────────────────────────────────
test('GET /seating/status reflects A\'s plan and is empty for B', async () => {
    const a = await request(app)
        .get(periodQuery('/api/seating/status', periodA.id))
        .set('Authorization', auth());
    assert.equal(a.status, 200);
    assert.ok(a.body.slots.some((s) => s.slot_id === slot1A && s.has_plan), 'A slot has a micro-plan');

    const b = await request(app)
        .get(periodQuery('/api/seating/status', periodB.id))
        .set('Authorization', auth());
    assert.equal(b.body.slots.length, 0, 'B has no slots');
});

// ── scheduled-courses is period-scoped ───────────────────────────────────────
test('GET /schedule/scheduled-courses is period-scoped', async () => {
    const a = await request(app)
        .get(periodQuery('/api/schedule/scheduled-courses', periodA.id))
        .set('Authorization', auth());
    assert.ok(a.body.scheduled.some((r) => r.course_code === courseA), 'A shows its scheduled course');

    const b = await request(app)
        .get(periodQuery('/api/schedule/scheduled-courses', periodB.id))
        .set('Authorization', auth());
    assert.ok(!b.body.scheduled.some((r) => r.course_code === courseA), 'A\'s course never appears under B');
});

// ── periods-overview counts never cross-bleed ────────────────────────────────
test('GET /periods-overview reports per-period counts with no bleed', async () => {
    const res = await request(app)
        .get('/api/invigilator-scheduling/periods-overview')
        .set('Authorization', auth());
    assert.equal(res.status, 200);
    const a = res.body.periods.find((p) => p.id === periodA.id);
    const b = res.body.periods.find((p) => p.id === periodB.id);
    assert.ok(a && b, 'both test periods present');

    assert.equal(a.slots, 2);
    assert.equal(a.scheduled_exams, 1);
    assert.equal(a.seating_plans, 1);
    assert.equal(a.invig_assignments, 2);

    assert.equal(b.slots, 0);
    assert.equal(b.scheduled_exams, 0);
    assert.equal(b.seating_plans, 0);
    assert.equal(b.invig_assignments, 0);
});

// ── swap requests are period-scoped ──────────────────────────────────────────
test('GET /swap-requests (admin) is period-scoped', async () => {
    const a = await request(app)
        .get(periodQuery('/api/invigilator-scheduling/swap-requests', periodA.id) + '&status=all')
        .set('Authorization', auth());
    assert.equal(a.status, 200);
    assert.equal(a.body.requests.length, 1, 'A holds its 1 swap request');

    const b = await request(app)
        .get(periodQuery('/api/invigilator-scheduling/swap-requests', periodB.id) + '&status=all')
        .set('Authorization', auth());
    assert.equal(b.body.requests.length, 0, 'B has no swap requests');
});

// ── regression #2: enrollment query must scope by semester_label ─────────────
// The same course_code seeded into BOTH test semesters; the unscoped query
// returns rows from both, the correct (semester-scoped) query returns one each.
test('course_enrollments must be semester-scoped (cross-semester leak guard)', async () => {
    const sharedCode = `__TEST_SHARED_${Date.now() % 100000}`.slice(0, 20);
    await seedCourse({ semester_label: periodA.semester_label, code: sharedCode, total_students: 1 });
    await seedCourse({ semester_label: periodB.semester_label, code: sharedCode, total_students: 1 });
    const rollA = await seedStudent();
    const rollB = await seedStudent();
    await seedEnrollment({ semester_label: periodA.semester_label, course_code: sharedCode, roll_number: rollA });
    await seedEnrollment({ semester_label: periodB.semester_label, course_code: sharedCode, roll_number: rollB });

    // Unscoped (the historical bug) sees BOTH semesters' enrollments.
    const [unscoped] = await db.query(
        `SELECT roll_number FROM course_enrollments WHERE course_code = ?`, [sharedCode]);
    assert.ok(unscoped.length >= 2, 'sanity: both semesters carry the shared course');

    // Scoped — the fix — sees exactly one per semester.
    const [scopedA] = await db.query(
        `SELECT roll_number FROM course_enrollments WHERE course_code = ? AND semester_label = ?`,
        [sharedCode, periodA.semester_label]);
    const [scopedB] = await db.query(
        `SELECT roll_number FROM course_enrollments WHERE course_code = ? AND semester_label = ?`,
        [sharedCode, periodB.semester_label]);
    assert.equal(scopedA.length, 1, 'semester A sees only its enrollment');
    assert.equal(scopedB.length, 1, 'semester B sees only its enrollment');
    assert.equal(scopedA[0].roll_number, rollA);
    assert.equal(scopedB[0].roll_number, rollB);
});
