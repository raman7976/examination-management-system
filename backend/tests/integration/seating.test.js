// ═════════════════════════════════════════════════════════════════════════════
//  Integration — seating engine (DEEPEST focus)
//
//  Two pipelines:
//   A) Micro-plan "Zip" algorithm (seatingController /api/seating):
//      generate-plan → view-plan → status. Regression guard: the SAME course code
//      in two semesters must seat ONLY the slot's-semester roster. Seats are
//      contiguous & non-overlapping; a re-run is idempotent (INSERT IGNORE).
//   B) KEY-ROW round-trip (examController /api/exams): generate-export streams an
//      .xlsx whose row 3 encodes "room_name|lane"; that exact buffer is fed back
//      to upload-seating, which rebuilds seating_allocations with
//      room_mode = (lane === 'P' ? 'P' : 'S'). A malformed KEY ROW is rejected
//      with NO partial write.
//
//  upload-seating HARD-RESETS the active period's allocations, so every call to it
//  runs inside withActivePeriod(periodA). generate-export is wrapped too so both
//  halves of the round-trip see the same active period.
// ═════════════════════════════════════════════════════════════════════════════

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../helpers/app.js';
import { bearer } from '../helpers/auth.js';
import { sweep } from '../helpers/teardown.js';
import db, { closePool } from '../helpers/db.js';
import {
    seedAdmin, seedCourse, seedStudent, seedEnrollment, seedSlot,
    seedScheduledExam, seedClassroom, seedClassroomSeats, seedAllocation,
} from '../helpers/seedFixtures.js';
import { createTestPeriod, periodQuery, withActivePeriod } from '../helpers/periodFixture.js';
import { testCourseCode } from '../fixtures/constants.js';

let admin, periodA, periodB;

before(async () => {
    admin = await seedAdmin({ local: 'seat_admin' });
    periodA = await createTestPeriod({ label: 'seatA' });
    periodB = await createTestPeriod({ label: 'seatB' });
});

after(async () => {
    await sweep('__TEST_');
    await closePool();
});

const auth = () => bearer(admin.token);

// supertest doesn't buffer binary bodies; this parser hands us the raw .xlsx Buffer.
function binaryParser(res, cb) {
    res.setEncoding('binary');
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => cb(null, Buffer.from(data, 'binary')));
}

// ════════════════════════════════════════════════════════════════════════════
//  A) MICRO-PLAN "ZIP" ALGORITHM
// ════════════════════════════════════════════════════════════════════════════
test('generate-plan seats ONLY the slot-semester roster (cross-semester guard)', async () => {
    // SAME course code lives in BOTH semesters with DIFFERENT rosters.
    const shared = testCourseCode('SEAT_SHARED');
    await seedCourse({ semester_label: periodA.semester_label, code: shared, name: 'Shared A', total_students: 2 });
    await seedCourse({ semester_label: periodB.semester_label, code: shared, name: 'Shared B', total_students: 2 });

    // Period A roster (the ones that MUST be seated).
    const rollA1 = await seedStudent();
    const rollA2 = await seedStudent();
    await seedEnrollment({ semester_label: periodA.semester_label, course_code: shared, roll_number: rollA1 });
    await seedEnrollment({ semester_label: periodA.semester_label, course_code: shared, roll_number: rollA2 });

    // Period B roster (decoys — MUST NOT appear in period A's plan).
    const rollB1 = await seedStudent();
    await seedEnrollment({ semester_label: periodB.semester_label, course_code: shared, roll_number: rollB1 });

    // Physical layout: one room, lane G with 5 chairs; allocate 2 seats.
    const room = await seedClassroom({ cap_green: 30 });
    await seedClassroomSeats({ classroom_id: room.id, lane: 'G', count: 5 });
    const slot = await seedSlot({ period_id: periodA.id });
    const exam = await seedScheduledExam({ slot_id: slot, course_code: shared });
    await seedAllocation({ scheduled_exam_id: exam, classroom_id: room.id, lane: 'G', student_count: 2, room_mode: 'S' });

    // status BEFORE generation → no plan yet.
    const before = await request(app)
        .get(periodQuery('/api/seating/status', periodA.id))
        .set('Authorization', auth());
    const slotBefore = before.body.slots.find((s) => s.slot_id === slot);
    assert.equal(slotBefore.has_plan, false, 'no micro-plan before generation');

    // GENERATE.
    const gen = await request(app)
        .post('/api/seating/generate-plan')
        .set('Authorization', auth())
        .send({ slot_id: slot });
    assert.equal(gen.status, 200);
    assert.equal(gen.body.mapped_students, 2, 'only the 2 period-A students seated');

    // view-plan: rolls are exactly period A's, seat numbers are unique (no double-seat).
    const view = await request(app)
        .get(`/api/seating/view-plan?slot_id=${slot}`)
        .set('Authorization', auth());
    assert.equal(view.status, 200);
    const rolls = view.body.data.map((r) => r.roll_number);
    assert.deepEqual([...rolls].sort(), [rollA1, rollA2].sort(), 'period-A roster seated');
    assert.ok(!rolls.includes(rollB1), 'period-B decoy NOT seated');
    const seats = view.body.data.map((r) => r.seat_number);
    assert.equal(new Set(seats).size, seats.length, 'every seat used at most once');

    // status AFTER → plan present with the right count.
    const afterGen = await request(app)
        .get(periodQuery('/api/seating/status', periodA.id))
        .set('Authorization', auth());
    const slotAfter = afterGen.body.slots.find((s) => s.slot_id === slot);
    assert.equal(slotAfter.has_plan, true);
    assert.equal(slotAfter.plan_count, 2);

    // RE-RUN is idempotent — clears + re-inserts, no duplicate rows.
    const rerun = await request(app)
        .post('/api/seating/generate-plan')
        .set('Authorization', auth())
        .send({ slot_id: slot });
    assert.equal(rerun.status, 200);
    assert.equal(rerun.body.mapped_students, 2);
    const view2 = await request(app)
        .get(`/api/seating/view-plan?slot_id=${slot}`)
        .set('Authorization', auth());
    assert.equal(view2.body.data.length, 2, 're-run did not duplicate seats');
});

test('generate-plan 400s without slot_id and 404s for an empty/unknown slot', async () => {
    const noSlot = await request(app)
        .post('/api/seating/generate-plan')
        .set('Authorization', auth())
        .send({});
    assert.equal(noSlot.status, 400);

    const unknown = await request(app)
        .post('/api/seating/generate-plan')
        .set('Authorization', auth())
        .send({ slot_id: 99999999 });
    assert.equal(unknown.status, 404, 'no such slot');

    // A real slot with no seating allocations → 404 ("No seating allocations").
    const emptySlot = await seedSlot({ period_id: periodA.id });
    const noAlloc = await request(app)
        .post('/api/seating/generate-plan')
        .set('Authorization', auth())
        .send({ slot_id: emptySlot });
    assert.equal(noAlloc.status, 404, 'slot has no allocations');
});

test('view-plan requires slot_id (400)', async () => {
    const res = await request(app)
        .get('/api/seating/view-plan')
        .set('Authorization', auth());
    assert.equal(res.status, 400);
});

// ════════════════════════════════════════════════════════════════════════════
//  B) KEY-ROW EXPORT → UPLOAD ROUND-TRIP
// ════════════════════════════════════════════════════════════════════════════
test('generate-export → upload-seating round-trips KEY ROW into allocations', async () => {
    // Isolated period so generate-export (which scans the WHOLE active period)
    // sees EXACTLY these two slots — no leakage from the micro-plan tests above.
    const periodRT = await createTestPeriod({ label: 'seatRT' });

    // Two rooms exercising BOTH room_mode branches on upload:
    //   roomP: cap_purple>0 → mode P → small course lands in the Purple lane.
    //   roomS: cap_purple=0 → forced S mode → giant course lands in the Green lane.
    const roomP = await seedClassroom({ room_name: 'SEATP', cap_purple: 30, cap_green: 30, cap_yellow: 30, location_order: 1 });
    const roomS = await seedClassroom({ room_name: 'SEATS', cap_purple: 0, cap_green: 30, cap_yellow: 30, location_order: 2 });

    const cP = testCourseCode('RT_P');
    const cS = testCourseCode('RT_S');
    await seedCourse({ semester_label: periodRT.semester_label, code: cP, name: 'RoundTrip Purple', total_students: 3 });
    await seedCourse({ semester_label: periodRT.semester_label, code: cS, name: 'RoundTrip Split', total_students: 4 });

    const slotP = await seedSlot({ period_id: periodRT.id, start_time: '09:00:00', end_time: '12:00:00' });
    const slotS = await seedSlot({ period_id: periodRT.id, start_time: '14:00:00', end_time: '17:00:00' });
    const examP = await seedScheduledExam({ slot_id: slotP, course_code: cP });
    const examS = await seedScheduledExam({ slot_id: slotS, course_code: cS });

    await withActivePeriod(periodRT, async () => {
        // 1) EXPORT — per-slot room config pins each course to one room.
        const exp = await request(app)
            .post('/api/exams/generate-export')
            .set('Authorization', auth())
            .send({ slotRoomConfig: { [slotP]: [roomP.id], [slotS]: [roomS.id] } })
            .buffer()
            .parse(binaryParser);
        assert.equal(exp.status, 200);
        assert.match(exp.headers['content-type'], /spreadsheetml\.sheet/);
        assert.ok(Buffer.isBuffer(exp.body) && exp.body.length > 0, 'got an xlsx buffer back');

        // 2) UPLOAD the unmodified draft straight back in.
        const up = await request(app)
            .post('/api/exams/upload-seating')
            .set('Authorization', auth())
            .attach('seatingFile', exp.body, 'reviewed.xlsx');
        assert.equal(up.status, 200);
        assert.equal(up.body.exams_processed, 2);
        assert.equal(up.body.allocations_saved, 2);
    });

    // 3) Verify persisted allocations + the room_mode rule.
    const [rows] = await db.query(
        `SELECT sa.scheduled_exam_id, sa.lane, sa.student_count, sa.room_mode
         FROM seating_allocations sa
         JOIN scheduled_exams se ON sa.scheduled_exam_id = se.id
         JOIN exam_slots es ON se.slot_id = es.id
         WHERE es.exam_period_id = ?`,
        [periodRT.id],
    );
    assert.equal(rows.length, 2);
    for (const r of rows) {
        assert.equal(r.room_mode, r.lane === 'P' ? 'P' : 'S', 'room_mode follows lane');
    }
    const purple = rows.find((r) => r.scheduled_exam_id === examP);
    assert.equal(purple.lane, 'P');
    assert.equal(purple.student_count, 3);
    const split = rows.find((r) => r.scheduled_exam_id === examS);
    assert.equal(split.lane, 'G');
    assert.equal(split.student_count, 4);

    // The saved plan is retrievable per slot.
    const plan = await request(app)
        .get(`/api/exams/slots/${slotP}/seating`)
        .set('Authorization', auth());
    assert.equal(plan.status, 200);
    assert.ok(plan.body.some((r) => r.room_name === roomP.room_name && r.lane === 'P'));
});

test('upload-seating rejects a malformed KEY ROW with NO partial write (400)', async () => {
    // Pre-seed an allocation that MUST survive a rejected upload.
    const room = await seedClassroom({ room_name: 'SEATM', cap_green: 30 });
    const cM = testCourseCode('RT_BAD');
    await seedCourse({ semester_label: periodA.semester_label, code: cM, name: 'Malformed', total_students: 2 });
    const slotM = await seedSlot({ period_id: periodA.id });
    const examM = await seedScheduledExam({ slot_id: slotM, course_code: cM });
    const survivor = await seedAllocation({ scheduled_exam_id: examM, classroom_id: room.id, lane: 'G', student_count: 2, room_mode: 'S' });

    // Build a slot_<id> sheet whose row 3 carries NO "room|lane" key cells.
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`bad (slot_${slotM})`);
    ws.addRow(['Slot meta']);                 // row 1
    ws.addRow(['#', 'Course', 'Inst', 'Total']); // row 2
    ws.addRow(['exam_id', 'course_name', 'no-pipe', 'total']); // row 3 — KEY ROW, no '|'
    ws.addRow(['', '', '', '']);              // row 4
    ws.addRow([examM, 'Malformed', '', 2]);   // row 5 — data
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    await withActivePeriod(periodA, async () => {
        const res = await request(app)
            .post('/api/exams/upload-seating')
            .set('Authorization', auth())
            .attach('seatingFile', buf, 'malformed.xlsx');
        assert.equal(res.status, 400, 'malformed KEY ROW rejected');
        assert.match(res.body.message, /No valid data/i);
    });

    // The pre-existing allocation is untouched — the HARD RESET never ran.
    const [still] = await db.query(`SELECT id FROM seating_allocations WHERE id = ?`, [survivor]);
    assert.equal(still.length, 1, 'no partial write — survivor allocation intact');
});

test('upload-seating 400s when no file is attached', async () => {
    const res = await request(app)
        .post('/api/exams/upload-seating')
        .set('Authorization', auth());
    assert.equal(res.status, 400);
    assert.match(res.body.message, /No file uploaded/i);
});
