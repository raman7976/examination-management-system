// ═════════════════════════════════════════════════════════════════════════════
//  Integration — scheduleController (/api/schedule) + scheduleBatchExams
//
//  The read/assign/unassign endpoints use an explicit period_id (safe lane).
//  scheduleBatchExams HARD-RESETS the active period, so it runs ONLY inside
//  withActivePeriod(periodA) and we assert period B's scheduled rows survive.
// ═════════════════════════════════════════════════════════════════════════════

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../helpers/app.js';
import { bearer } from '../helpers/auth.js';
import { sweep } from '../helpers/teardown.js';
import db, { closePool } from '../helpers/db.js';
import { seedAdmin, seedCourse, seedSlot, seedScheduledExam } from '../helpers/seedFixtures.js';
import { createTestPeriod, periodQuery, withActivePeriod } from '../helpers/periodFixture.js';
import { testCourseCode } from '../fixtures/constants.js';

let admin, periodA, periodB, slotA, slotB, c1, c2;

before(async () => {
    admin = await seedAdmin({ local: 'sched_admin' });
    periodA = await createTestPeriod({ label: 'schedA' });
    periodB = await createTestPeriod({ label: 'schedB' });

    slotA = await seedSlot({ period_id: periodA.id });
    slotB = await seedSlot({ period_id: periodB.id });

    c1 = testCourseCode('SCH1');
    c2 = testCourseCode('SCH2');
    await seedCourse({ semester_label: periodA.semester_label, code: c1, name: 'Sched One', total_students: 30 });
    await seedCourse({ semester_label: periodA.semester_label, code: c2, name: 'Sched Two', total_students: 20 });
});

after(async () => {
    await sweep('__TEST_');
    await closePool();
});

const auth = () => bearer(admin.token);

test('GET /unscheduled-courses lists the period\'s unscheduled courses', async () => {
    const res = await request(app)
        .get(periodQuery('/api/schedule/unscheduled-courses', periodA.id))
        .set('Authorization', auth());
    assert.equal(res.status, 200);
    const codes = res.body.courses.map((c) => c.course_code);
    assert.ok(codes.includes(c1) && codes.includes(c2), 'both seeded courses are unscheduled');
});

test('POST /assign schedules a course and moves it off the unscheduled list', async () => {
    const res = await request(app)
        .post('/api/schedule/assign')
        .set('Authorization', auth())
        .send({ slot_id: slotA, course_codes: [c1], period_id: periodA.id });
    assert.equal(res.status, 200);
    assert.equal(res.body.courses_assigned, 1);

    const scheduled = await request(app)
        .get(periodQuery('/api/schedule/scheduled-courses', periodA.id))
        .set('Authorization', auth());
    assert.ok(scheduled.body.scheduled.some((r) => r.course_code === c1), 'c1 now scheduled');

    const unsched = await request(app)
        .get(periodQuery('/api/schedule/unscheduled-courses', periodA.id))
        .set('Authorization', auth());
    assert.ok(!unsched.body.courses.some((c) => c.course_code === c1), 'c1 left the unscheduled list');
});

test('POST /assign rejects an out-of-period slot (400)', async () => {
    const wrongSlot = await request(app)
        .post('/api/schedule/assign')
        .set('Authorization', auth())
        .send({ slot_id: slotB, course_codes: [c2], period_id: periodA.id });
    assert.equal(wrongSlot.status, 400, 'slot B does not belong to period A');
});

// scheduled_exams now carries UNIQUE KEY uq_slot_course (slot_id, course_code)
// (migration 2026-05-31_scheduled_exams_unique), so re-assigning the same course
// to the same slot is rejected by the DB and the controller's ER_DUP_ENTRY → 409
// branch fires. No duplicate row is created.
test('re-assigning the same course to the same slot is rejected (409)', async () => {
    const dup = await request(app)
        .post('/api/schedule/assign')
        .set('Authorization', auth())
        .send({ slot_id: slotA, course_codes: [c1], period_id: periodA.id });
    assert.equal(dup.status, 409, 'duplicate assign is rejected by the unique constraint');

    const [rows] = await db.query(
        `SELECT id FROM scheduled_exams WHERE slot_id = ? AND course_code = ?`,
        [slotA, c1],
    );
    assert.equal(rows.length, 1, 'no duplicate scheduled_exams row was created');
});

test('DELETE /unassign/:id removes a scheduled course', async () => {
    const scheduled = await request(app)
        .get(periodQuery('/api/schedule/scheduled-courses', periodA.id))
        .set('Authorization', auth());
    const row = scheduled.body.scheduled.find((r) => r.course_code === c1);
    assert.ok(row, 'c1 is scheduled');

    const res = await request(app)
        .delete(`/api/schedule/unassign/${row.id}`)
        .set('Authorization', auth());
    assert.equal(res.status, 200);

    const missing = await request(app)
        .delete('/api/schedule/unassign/99999999')
        .set('Authorization', auth());
    assert.equal(missing.status, 404);
});

test('scheduleBatchExams hard-resets ONLY the active period, leaving others intact', async () => {
    // Seed a scheduled exam in period B that must survive the batch reset of A.
    const survivorExamId = await seedScheduledExam({ slot_id: slotB, course_code: c2 });

    await withActivePeriod(periodA, async () => {
        const res = await request(app)
            .post('/api/exams/schedule-batch')
            .set('Authorization', auth())
            // no explicit period_id → uses the (test) active period A
            .send({ courses: [{ slotId: slotA, courseCode: c1 }, { slotId: slotA, courseCode: c2 }] });
        assert.equal(res.status, 201);
        assert.equal(res.body.new_courses, 2);
    });

    // Period A now has exactly the 2 fresh courses.
    const [aRows] = await db.query(
        `SELECT se.id FROM scheduled_exams se JOIN exam_slots es ON se.slot_id = es.id WHERE es.exam_period_id = ?`,
        [periodA.id],
    );
    assert.equal(aRows.length, 2, 'period A reset to the 2 new courses');

    // Period B's pre-existing scheduled exam is untouched.
    const [bRows] = await db.query(`SELECT id FROM scheduled_exams WHERE id = ?`, [survivorExamId]);
    assert.equal(bRows.length, 1, 'period B scheduled exam survived the reset');
});
