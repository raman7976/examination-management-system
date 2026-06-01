// ═════════════════════════════════════════════════════════════════════════════
//  Unit tests — utils/seatingAlgorithm.js  (the "fracture" allocator)
//
//  Pure function, NO database. These lock the lane logic (Purple/Green/Yellow),
//  the fracture/sticky rules, location-order re-sort, the overflow path, and
//  seat-count conservation. This is the deepest-tested module per the user's
//  emphasis on seating.
// ═════════════════════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { runSeatingAlgorithm } from '../../utils/seatingAlgorithm.js';

// ── builders ────────────────────────────────────────────────────────────────
let nextRoomId = 1;
function room(overrides = {}) {
    const id = overrides.id ?? nextRoomId++;
    return {
        id,
        room_name: overrides.room_name ?? `R${id}`,
        cap_purple: overrides.cap_purple ?? 10,
        cap_green: overrides.cap_green ?? 30,
        cap_yellow: overrides.cap_yellow ?? 30,
        priority: overrides.priority ?? 1,
        location_order: overrides.location_order ?? id,
        type: overrides.type ?? 'normal',
    };
}
let nextCourseId = 1;
function course(student_count, overrides = {}) {
    const id = overrides.id ?? nextCourseId++;
    return { id, course_name: overrides.course_name ?? `C${id}`, student_count };
}
const seated = (allocs) => allocs.reduce((s, a) => s + a.student_count, 0);
const forCourse = (allocs, id) => allocs.filter((a) => a.scheduled_exam_id === id);
const forRoom = (allocs, id) => allocs.filter((a) => a.classroom_id === id);

// ── 1. enabledRoomIds filter ──────────────────────────────────────────────────
test('only enabled rooms receive allocations', () => {
    const a = room({ id: 101, cap_purple: 50 });
    const b = room({ id: 102, cap_purple: 50 });
    const { allocations } = runSeatingAlgorithm([a, b], [course(20, { id: 1 })], [101]);
    assert.ok(allocations.length > 0);
    assert.equal(forRoom(allocations, 102).length, 0, 'disabled room must be unused');
    assert.ok(forRoom(allocations, 101).length > 0);
});

// ── 2. capacity sufficient → pure Purple, no fracture, conservation ───────────
test('sufficient capacity stays in Purple mode and conserves seats', () => {
    const a = room({ id: 1, cap_purple: 30 });
    const b = room({ id: 2, cap_purple: 30 });
    const courses = [course(20, { id: 1 }), course(15, { id: 2 })];
    const { allocations, summary } = runSeatingAlgorithm([a, b], courses, [1, 2]);

    assert.equal(summary.fractureActive, false);
    assert.equal(summary.purpleCap, 60);
    assert.ok(allocations.every((x) => x.lane === 'P'), 'all lanes Purple');
    assert.ok(allocations.every((x) => x.room_mode === 'P'), 'all rooms in P mode');
    assert.equal(seated(allocations), 35, 'every student seated exactly once');
});

// ── 3. exact-fit single course in one Purple room ────────────────────────────
test('exact-fit course fills a single Purple room', () => {
    const a = room({ id: 1, cap_purple: 10 });
    const { allocations, summary } = runSeatingAlgorithm([a], [course(10, { id: 1 })], [1]);
    assert.equal(summary.fractureActive, false);
    assert.equal(allocations.length, 1);
    assert.deepEqual(
        { lane: allocations[0].lane, count: allocations[0].student_count, mode: allocations[0].room_mode },
        { lane: 'P', count: 10, mode: 'P' },
    );
});

// ── 4. fracture: giant → Green, others → Yellow ──────────────────────────────
test('under deficit the room fractures; giant goes Green, others Yellow', () => {
    const a = room({ id: 1, cap_purple: 10, cap_green: 30, cap_yellow: 30, location_order: 1 });
    const big = course(20, { id: 1 });   // index 0 after sort → giant
    const small = course(15, { id: 2 });
    const { allocations, summary } = runSeatingAlgorithm([a], [big, small], [1]);

    assert.equal(summary.fractureActive, true);
    assert.ok(allocations.every((x) => x.room_mode === 'S'), 'fractured room is in S mode');
    assert.equal(forCourse(allocations, 1)[0].lane, 'G', 'giant → Green');
    assert.equal(forCourse(allocations, 2)[0].lane, 'Y', 'second course → Yellow');
    assert.equal(seated(allocations), 35);
});

// ── 5. sticky rooms are NEVER fractured ──────────────────────────────────────
test('a sticky room stays in Purple mode even when the run is fracturing', () => {
    // normal room is fractured first; demand stays above capacity so the loop
    // reaches the sticky room — which must be skipped (stays P).
    const normal = room({ id: 1, cap_purple: 10, cap_green: 50, cap_yellow: 50, priority: 1, location_order: 1, type: 'normal' });
    const sticky = room({ id: 2, cap_purple: 10, cap_green: 50, cap_yellow: 50, priority: 2, location_order: 2, type: 'sticky' });
    const { allocations, summary } = runSeatingAlgorithm([normal, sticky], [course(150, { id: 1 })], [1, 2]);

    assert.equal(summary.fractureActive, true);
    const stickyAllocs = forRoom(allocations, 2);
    assert.ok(stickyAllocs.length > 0, 'sticky room is still used');
    assert.ok(stickyAllocs.every((x) => x.room_mode === 'P'), 'sticky room never fractured');
    assert.ok(stickyAllocs.every((x) => x.lane === 'P'), 'sticky room only fills its Purple lane');
    const normalAllocs = forRoom(allocations, 1);
    assert.ok(normalAllocs.every((x) => x.room_mode === 'S'), 'normal room WAS fractured');
});

// ── 6. cap_purple === 0 forces S mode independent of fracture ─────────────────
test('a split-only room (cap_purple = 0) is in S mode even with no deficit', () => {
    const splitOnly = room({ id: 1, cap_purple: 0, cap_green: 20, cap_yellow: 20, priority: 1, location_order: 1 });
    const big = room({ id: 2, cap_purple: 100, priority: 2, location_order: 2 });
    const { allocations, summary } = runSeatingAlgorithm([splitOnly, big], [course(10, { id: 1 })], [1, 2]);

    assert.equal(summary.fractureActive, false, 'big purple room means no capacity deficit');
    const splitAllocs = forRoom(allocations, 1);
    assert.ok(splitAllocs.length > 0);
    assert.ok(splitAllocs.every((x) => x.room_mode === 'S'), 'cap_purple=0 room forced to S');
    assert.ok(splitAllocs.every((x) => x.lane === 'G' || x.lane === 'Y'), 'split-only room never uses Purple');
});

// ── 7. rooms are re-sorted by location_order before allocation ────────────────
test('allocation output is ordered by location_order', () => {
    const a = room({ id: 1, cap_purple: 10, priority: 1, location_order: 2 });
    const b = room({ id: 2, cap_purple: 10, priority: 2, location_order: 1 });
    const { allocations } = runSeatingAlgorithm([a, b], [course(15, { id: 1 })], [1, 2]);
    // B (location_order 1) must come before A (location_order 2)
    assert.equal(allocations[0].classroom_id, 2);
    assert.equal(allocations[1].classroom_id, 1);
});

// ── 8. overflow path lands a course in Green when its Yellow is exhausted ─────
test('overflow places a course into Green after its Yellow fills up', () => {
    // Yellow (8) is consumed by C2; C3 cannot enter Yellow during ideal pass,
    // so the overflow pass routes it into the still-open Green lane.
    const a = room({ id: 1, cap_purple: 5, cap_green: 100, cap_yellow: 8, location_order: 1 });
    const c1 = course(10, { id: 1 }); // giant → Green
    const c2 = course(8, { id: 2 });  // fills Yellow
    const c3 = course(8, { id: 3 });  // Yellow full → overflow into Green
    const { allocations, summary } = runSeatingAlgorithm([a], [c1, c2, c3], [1]);

    assert.equal(summary.fractureActive, true);
    assert.equal(forCourse(allocations, 3)[0].lane, 'G', 'C3 routed to Green via overflow');
    assert.equal(seated(allocations), 26, 'all 26 students seated');
});

// ── 9. zero enabled rooms → empty allocation, demand still reported ───────────
test('no enabled rooms yields no allocations but records demand', () => {
    const { allocations, summary, log } = runSeatingAlgorithm([room({ id: 1 })], [course(40, { id: 1 })], []);
    assert.equal(allocations.length, 0);
    assert.equal(summary.totalDemand, 40);
    assert.ok(log.some((l) => l.tag === 'error'), 'unallocated demand is logged as error');
});

// ── 10. largest-course-first ordering determines the giant ────────────────────
test('the largest course is treated as the giant regardless of input order', () => {
    const a = room({ id: 1, cap_purple: 5, cap_green: 100, cap_yellow: 100, location_order: 1 });
    // smaller course listed first, bigger second — algorithm must sort desc
    const { allocations } = runSeatingAlgorithm([a], [course(10, { id: 1 }), course(40, { id: 2 })], [1]);
    // fracture is active (demand 50 > purple 5); giant (id 2) → Green, other → Yellow
    assert.equal(forCourse(allocations, 2)[0].lane, 'G', 'biggest course is the giant → Green');
    assert.equal(forCourse(allocations, 1)[0].lane, 'Y');
});
