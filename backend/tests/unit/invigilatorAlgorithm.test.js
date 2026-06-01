// ═════════════════════════════════════════════════════════════════════════════
//  Unit tests — utils/invigilatorAlgorithm.js  (two-phase allocator)
//
//  Pure function, NO database. Locks the headcount formula, Phase A instructor
//  even-spread, Phase B deficit-first picking + tiebreaks, no-double-booking,
//  pool-exhaustion warnings and the per-user summary balance.
// ═════════════════════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { runInvigilatorAlgorithm } from '../../utils/invigilatorAlgorithm.js';

const slot = (slot_id) => ({ slot_id, exam_date: '2099-01-01', start_time: '09:00:00' });
const invig = (user_id, role, effective_target) => ({ user_id, role, effective_target });

// ── 1. required headcount = max(1, ceil(students / 25)) ──────────────────────
test('per-room required headcount follows max(1, ceil(students/25))', () => {
    const cases = [
        [0, 1], [1, 1], [24, 1], [25, 1], [26, 2], [50, 2], [51, 3],
    ];
    for (const [students, expected] of cases) {
        const pool = Array.from({ length: 6 }, (_, i) => invig(i + 1, 'faculty', 10));
        const { assignments } = runInvigilatorAlgorithm(
            [slot(1)],
            { 1: [{ classroom_id: 9, location_order: 1, students_in_room: students }] },
            {},
            pool,
        );
        assert.equal(assignments.length, expected, `${students} students → ${expected} invigilators`);
    }
});

// ── 2. Phase A: k >= n → every course room gets an instructor ─────────────────
test('Phase A places an instructor in every room when instructors >= rooms', () => {
    const { assignments } = runInvigilatorAlgorithm(
        [slot(1)],
        { 1: [
            { classroom_id: 10, location_order: 1, students_in_room: 20 },
            { classroom_id: 11, location_order: 2, students_in_room: 20 },
        ] },
        { 1: [{ course_code: 'CS1', classroom_ids: [10, 11], instructor_user_ids: [1, 2] }] },
        [invig(1, 'faculty', 5), invig(2, 'faculty', 5)],
    );
    const instr = assignments.filter((a) => a.is_course_instructor === 1);
    assert.equal(instr.length, 2);
    assert.deepEqual(instr.map((a) => a.classroom_id).sort(), [10, 11]);
});

// ── 3. Phase A: k < n → instructors spread at floor((i+0.5)*n/k) ──────────────
test('Phase A spreads fewer instructors evenly across rooms', () => {
    // n=4 rooms, k=2 instructors → indices floor(0.5*4/2)=1 and floor(1.5*4/2)=3
    const rooms = [
        { classroom_id: 40, location_order: 1, students_in_room: 10 },
        { classroom_id: 41, location_order: 2, students_in_room: 10 },
        { classroom_id: 42, location_order: 3, students_in_room: 10 },
        { classroom_id: 43, location_order: 4, students_in_room: 10 },
    ];
    const { assignments } = runInvigilatorAlgorithm(
        [slot(1)],
        { 1: rooms },
        { 1: [{ course_code: 'CS1', classroom_ids: [40, 41, 42, 43], instructor_user_ids: [1, 2] }] },
        // give the general pool huge targets so Phase B doesn't add instructors elsewhere
        [invig(1, 'faculty', 0), invig(2, 'faculty', 0)],
    );
    const instrRooms = assignments
        .filter((a) => a.is_course_instructor === 1)
        .map((a) => a.classroom_id)
        .sort((x, y) => x - y);
    assert.deepEqual(instrRooms, [41, 43], 'instructors land in the 2nd and 4th rooms by location');
});

// ── 4. nobody is assigned to two rooms in the same slot ──────────────────────
test('an invigilator is never double-booked within one slot', () => {
    const rooms = [
        { classroom_id: 50, location_order: 1, students_in_room: 10 },
        { classroom_id: 51, location_order: 2, students_in_room: 10 },
    ];
    const { assignments } = runInvigilatorAlgorithm(
        [slot(1)],
        { 1: rooms },
        {},
        [invig(1, 'faculty', 5), invig(2, 'faculty', 5)],
    );
    const perUser = assignments.reduce((m, a) => m.set(a.user_id, (m.get(a.user_id) || 0) + 1), new Map());
    for (const [, count] of perUser) assert.equal(count, 1, 'each user at most once in the slot');
});

// ── 5. Phase B picks the largest deficit first ───────────────────────────────
test('Phase B fills with the most-behind invigilator first', () => {
    const { assignments } = runInvigilatorAlgorithm(
        [slot(1)],
        { 1: [{ classroom_id: 60, location_order: 1, students_in_room: 10 }] }, // need 1
        {},
        [invig(1, 'faculty', 1), invig(2, 'faculty', 3)], // user 2 has the bigger target → bigger deficit
    );
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].user_id, 2, 'larger-deficit user picked');
});

// ── 6. tiebreak by role (faculty < phd_student < lab_staff) ───────────────────
test('equal deficit breaks ties by role rank', () => {
    const { assignments } = runInvigilatorAlgorithm(
        [slot(1)],
        { 1: [{ classroom_id: 70, location_order: 1, students_in_room: 10 }] },
        {},
        [invig(5, 'phd_student', 2), invig(6, 'faculty', 2)], // same deficit, faculty wins
    );
    assert.equal(assignments[0].user_id, 6);
});

// ── 7. tiebreak by user_id when deficit and role are equal ───────────────────
test('equal deficit and role breaks ties by ascending user_id', () => {
    const { assignments } = runInvigilatorAlgorithm(
        [slot(1)],
        { 1: [{ classroom_id: 80, location_order: 1, students_in_room: 10 }] },
        {},
        [invig(9, 'faculty', 2), invig(4, 'faculty', 2)],
    );
    assert.equal(assignments[0].user_id, 4, 'lower id wins');
});

// ── 8. pool exhaustion produces a warning and a short room ────────────────────
test('an understaffed slot is reported in warnings', () => {
    const { assignments, warnings } = runInvigilatorAlgorithm(
        [slot(1)],
        { 1: [{ classroom_id: 90, location_order: 1, students_in_room: 30 }] }, // need 2
        {},
        [invig(1, 'faculty', 5)], // only one invigilator
    );
    assert.equal(assignments.length, 1);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /short by 1/);
});

// ── 9. summary.balance = assigned − target ───────────────────────────────────
test('summary reports assigned, target and balance per user', () => {
    const { summary } = runInvigilatorAlgorithm(
        [slot(1)],
        { 1: [{ classroom_id: 91, location_order: 1, students_in_room: 10 }] },
        {},
        [invig(1, 'faculty', 3), invig(2, 'faculty', 3)],
    );
    const picked = summary.find((s) => s.assigned === 1);
    assert.ok(picked, 'the picked user appears in the summary');
    assert.equal(picked.target, 3);
    assert.equal(picked.balance, -2, 'balance is assigned minus target');
    assert.equal(summary.length, 2, 'every invigilator appears in the summary');
});

// ── 10. duties accrue across slots so load stays balanced ─────────────────────
test('counters accrue chronologically to keep duties fair across slots', () => {
    const { summary } = runInvigilatorAlgorithm(
        [slot(1), slot(2)],
        {
            1: [{ classroom_id: 1, location_order: 1, students_in_room: 10 }], // need 1
            2: [{ classroom_id: 2, location_order: 1, students_in_room: 10 }], // need 1
        },
        {},
        [invig(1, 'faculty', 5), invig(2, 'faculty', 5)],
    );
    // slot 1 picks the lower id (tie), slot 2 should pick the other → 1 each
    assert.deepEqual(
        summary.map((s) => s.assigned).sort(),
        [1, 1],
        'both invigilators end up with one duty',
    );
});

// ── 11. an instructor isn't reused for a second course in the same slot ───────
test('a shared instructor is placed once even if listed for two courses', () => {
    const rooms = [
        { classroom_id: 1, location_order: 1, students_in_room: 10 },
        { classroom_id: 2, location_order: 2, students_in_room: 10 },
    ];
    const { assignments } = runInvigilatorAlgorithm(
        [slot(1)],
        { 1: rooms },
        { 1: [
            { course_code: 'CS1', classroom_ids: [1], instructor_user_ids: [7] },
            { course_code: 'CS2', classroom_ids: [2], instructor_user_ids: [7] }, // same instructor
        ] },
        [invig(7, 'faculty', 5), invig(8, 'faculty', 5)],
    );
    const sevenCount = assignments.filter((a) => a.user_id === 7).length;
    assert.equal(sevenCount, 1, 'instructor 7 used at most once in the slot');
});

// ── 12. target 0 invigilators are not preferred while others are under target ─
test('zero-target invigilators are skipped while under-target ones remain', () => {
    const { assignments } = runInvigilatorAlgorithm(
        [slot(1)],
        { 1: [{ classroom_id: 1, location_order: 1, students_in_room: 10 }] }, // need 1
        {},
        [invig(1, 'faculty', 0), invig(2, 'faculty', 1)],
    );
    assert.equal(assignments[0].user_id, 2, 'under-target user picked over the zero-target one');
});
