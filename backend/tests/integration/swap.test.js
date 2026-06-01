// ═════════════════════════════════════════════════════════════════════════════
//  Integration — invigilatorSwapController (/api/invigilator-scheduling/swap-*)
//
//  The full two-way swap + cover state machine:
//    pending_peer → (peer accept) → pending_admin → (admin approve) → approved
//    pending_peer → (peer reject)  → rejected_by_peer        [terminal]
//    pending_peer → (requester cancel) → cancelled           [terminal]
//    pending_admin → (admin reject / failDefensively) → rejected_by_admin
//
//  Execution mechanics asserted at the row level:
//    • different slots → admin approve swaps user_id between the two duties.
//    • same slot       → admin approve swaps classroom_id (user_id untouched,
//                        so uq_slot_user is never tripped mid-transaction).
//    • cover           → the requester's duty is reassigned to the volunteer.
//
//  Every endpoint accepts an explicit period_id (body for POST, query for GET),
//  so the whole suite rides resolveActivePeriod's safe lane — the global active
//  period is never touched. All rows are __TEST_-tagged for teardown.
// ═════════════════════════════════════════════════════════════════════════════

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../helpers/app.js';
import { bearer } from '../helpers/auth.js';
import { sweep } from '../helpers/teardown.js';
import db, { closePool } from '../helpers/db.js';
import { seedAdmin, seedUser, seedClassroom, seedSlot, seedAssignment } from '../helpers/seedFixtures.js';
import { createTestPeriod, periodQuery } from '../helpers/periodFixture.js';

let admin, periodS, r1, r2, r3, A, B, C;

before(async () => {
    admin = await seedAdmin({ local: 'swap_admin' });
    periodS = await createTestPeriod({ label: 'swapP' });
    r1 = await seedClassroom({ room_name: 'SWR1' });
    r2 = await seedClassroom({ room_name: 'SWR2' });
    r3 = await seedClassroom({ room_name: 'SWR3' });
    A = await seedUser({ role: 'faculty', local: 'swap_A' });
    B = await seedUser({ role: 'phd_student', local: 'swap_B' });
    C = await seedUser({ role: 'lab_staff', local: 'swap_C' });
});

after(async () => {
    await sweep('__TEST_');
    await closePool();
});

const base = '/api/invigilator-scheduling';
const adminAuth = () => bearer(admin.token);

// Fresh slot in the test period (distinct id per call, so suites never collide
// on uq_slot_user = (slot_id, user_id, exam_period_id)).
const slot = () => seedSlot({ period_id: periodS.id });
// One assignment row in the test period.
const duty = (slot_id, classroom_id, user_id) =>
    seedAssignment({ slot_id, classroom_id, user_id, period_id: periodS.id });

const userOf = async (assignmentId) => {
    const [[row]] = await db.query(
        `SELECT user_id, classroom_id FROM invigilator_assignments WHERE id = ?`, [assignmentId]);
    return row;
};
const statusOf = async (swapId) => {
    const [[row]] = await db.query(
        `SELECT status FROM invigilator_swap_requests WHERE id = ?`, [swapId]);
    return row?.status;
};

// ── two-way swap across slots → user_id exchange ─────────────────────────────
test('cross-slot swap: request → peer accept → admin approve swaps user_id', async () => {
    const s1 = await slot();
    const s2 = await slot();
    const aA = await duty(s1, r1.id, A.id);
    const aB = await duty(s2, r2.id, B.id);

    // A proposes the trade.
    const create = await request(app)
        .post(`${base}/swap-requests`)
        .set('Authorization', bearer(A.token))
        .send({ requester_assignment_id: aA, target_assignment_id: aB, period_id: periodS.id });
    assert.equal(create.status, 201);
    const swapId = create.body.request.id;
    assert.equal(create.body.request.status, 'pending_peer');

    // It shows up in B's incoming queue.
    const incoming = await request(app)
        .get(periodQuery(`${base}/swap-requests/incoming`, periodS.id))
        .set('Authorization', bearer(B.token));
    assert.equal(incoming.status, 200);
    assert.ok(incoming.body.requests.some((r) => r.id === swapId), 'request is in B incoming');

    // B accepts → pending_admin.
    const peer = await request(app)
        .put(`${base}/swap-requests/${swapId}/peer-respond`)
        .set('Authorization', bearer(B.token))
        .send({ accept: true });
    assert.equal(peer.status, 200);
    assert.equal(peer.body.status, 'pending_admin');

    // Admin sees it in the pending_admin queue.
    const queue = await request(app)
        .get(periodQuery(`${base}/swap-requests`, periodS.id))
        .set('Authorization', adminAuth());
    assert.ok(queue.body.requests.some((r) => r.id === swapId), 'request is in admin queue');

    // Admin approves → executed.
    const approve = await request(app)
        .put(`${base}/swap-requests/${swapId}/admin-respond`)
        .set('Authorization', adminAuth())
        .send({ accept: true });
    assert.equal(approve.status, 200);
    assert.equal(approve.body.status, 'approved');

    // Different slots → user_id was swapped (rooms stayed put).
    const rowA = await userOf(aA);
    const rowB = await userOf(aB);
    assert.equal(rowA.user_id, B.id, 'A\'s old duty now belongs to B');
    assert.equal(rowB.user_id, A.id, 'B\'s old duty now belongs to A');
    assert.equal(rowA.classroom_id, r1.id, 'room unchanged on a user_id swap');
});

// ── same-slot swap → classroom_id exchange ───────────────────────────────────
test('same-slot swap exchanges classroom_id, not user_id', async () => {
    const s = await slot();
    const aA = await duty(s, r1.id, A.id);
    const aB = await duty(s, r2.id, B.id);

    const create = await request(app)
        .post(`${base}/swap-requests`)
        .set('Authorization', bearer(A.token))
        .send({ requester_assignment_id: aA, target_assignment_id: aB, period_id: periodS.id });
    assert.equal(create.status, 201);
    const swapId = create.body.request.id;

    await request(app).put(`${base}/swap-requests/${swapId}/peer-respond`)
        .set('Authorization', bearer(B.token)).send({ accept: true });
    const approve = await request(app).put(`${base}/swap-requests/${swapId}/admin-respond`)
        .set('Authorization', adminAuth()).send({ accept: true });
    assert.equal(approve.status, 200);

    // Same slot → user_id stays, classroom_id swaps (avoids uq_slot_user mid-txn).
    const rowA = await userOf(aA);
    const rowB = await userOf(aB);
    assert.equal(rowA.user_id, A.id, 'A keeps ownership of their row');
    assert.equal(rowB.user_id, B.id, 'B keeps ownership of their row');
    assert.equal(rowA.classroom_id, r2.id, 'A moved into B\'s room');
    assert.equal(rowB.classroom_id, r1.id, 'B moved into A\'s room');
});

// ── peer reject is terminal ──────────────────────────────────────────────────
test('peer reject → rejected_by_peer, assignments untouched', async () => {
    const s1 = await slot();
    const s2 = await slot();
    const aA = await duty(s1, r1.id, A.id);
    const aB = await duty(s2, r2.id, B.id);

    const create = await request(app)
        .post(`${base}/swap-requests`)
        .set('Authorization', bearer(A.token))
        .send({ requester_assignment_id: aA, target_assignment_id: aB, period_id: periodS.id });
    const swapId = create.body.request.id;

    const reject = await request(app)
        .put(`${base}/swap-requests/${swapId}/peer-respond`)
        .set('Authorization', bearer(B.token))
        .send({ accept: false });
    assert.equal(reject.status, 200);
    assert.equal(reject.body.status, 'rejected_by_peer');

    // Admin cannot act on a peer-rejected request.
    const tooLate = await request(app)
        .put(`${base}/swap-requests/${swapId}/admin-respond`)
        .set('Authorization', adminAuth())
        .send({ accept: true });
    assert.equal(tooLate.status, 409, 'terminal request not awaiting admin');

    assert.equal((await userOf(aA)).user_id, A.id, 'A duty unchanged');
    assert.equal((await userOf(aB)).user_id, B.id, 'B duty unchanged');
});

// ── cover request ────────────────────────────────────────────────────────────
test('cover: request → peer accept → admin approve reassigns the duty', async () => {
    const s1 = await slot();
    const aA = await duty(s1, r1.id, A.id); // A's duty; B is free in s1

    const create = await request(app)
        .post(`${base}/swap-requests`)
        .set('Authorization', bearer(A.token))
        .send({ request_type: 'cover', requester_assignment_id: aA, target_user_id: B.id, period_id: periodS.id });
    assert.equal(create.status, 201);
    assert.equal(create.body.request.request_type, 'cover');
    const swapId = create.body.request.id;

    await request(app).put(`${base}/swap-requests/${swapId}/peer-respond`)
        .set('Authorization', bearer(B.token)).send({ accept: true });
    const approve = await request(app).put(`${base}/swap-requests/${swapId}/admin-respond`)
        .set('Authorization', adminAuth()).send({ accept: true });
    assert.equal(approve.status, 200);
    assert.equal(approve.body.status, 'approved');

    // The duty is now B's; the room is unchanged.
    const row = await userOf(aA);
    assert.equal(row.user_id, B.id, 'cover handed the duty to the volunteer');
    assert.equal(row.classroom_id, r1.id, 'room unchanged on a cover');
});

// ── failDefensively: schedule moves under an approved-by-peer request ────────
test('admin approve fails defensively when a collision appears → rejected_by_admin (409)', async () => {
    const s1 = await slot();
    const s2 = await slot();
    const aA = await duty(s1, r1.id, A.id);
    const aB = await duty(s2, r2.id, B.id);

    const create = await request(app)
        .post(`${base}/swap-requests`)
        .set('Authorization', bearer(A.token))
        .send({ requester_assignment_id: aA, target_assignment_id: aB, period_id: periodS.id });
    const swapId = create.body.request.id;

    await request(app).put(`${base}/swap-requests/${swapId}/peer-respond`)
        .set('Authorization', bearer(B.token)).send({ accept: true });

    // Sabotage: give B a SECOND duty in s1. Now swapping A↔B (A→s2, B→s1) would
    // place B in s1 twice → the post-swap collision check must trip.
    const sabotage = await duty(s1, r3.id, B.id);

    const approve = await request(app)
        .put(`${base}/swap-requests/${swapId}/admin-respond`)
        .set('Authorization', adminAuth())
        .send({ accept: true });
    assert.equal(approve.status, 409, 'collision detected at approval time');
    assert.equal(approve.body.status, 'rejected_by_admin');
    assert.equal(await statusOf(swapId), 'rejected_by_admin', 'audit trail records the auto-reject');

    // Original duties untouched (no partial swap).
    assert.equal((await userOf(aA)).user_id, A.id);
    assert.equal((await userOf(aB)).user_id, B.id);
    assert.equal((await userOf(sabotage)).user_id, B.id);
});

// ── swap-eligible feasibility (NOT EXISTS) ───────────────────────────────────
test('GET /swap-eligible excludes infeasible targets and validates ownership', async () => {
    const s1 = await slot();
    const s2 = await slot();
    const s3 = await slot();
    const aA1 = await duty(s1, r1.id, A.id); // A also has a duty in s2 …
    await duty(s2, r2.id, A.id);             // … so any s2 target is infeasible for A
    const aB2 = await duty(s2, r3.id, B.id); // B in s2  → must be EXCLUDED
    const aC3 = await duty(s3, r1.id, C.id); // C in s3  → feasible, included

    const res = await request(app)
        .get(periodQuery(`${base}/swap-eligible`, periodS.id) + `&my_assignment_id=${aA1}`)
        .set('Authorization', bearer(A.token));
    assert.equal(res.status, 200);
    const ids = res.body.eligible.map((e) => e.assignment_id);
    assert.ok(!ids.includes(aB2), 'B\'s s2 duty excluded (A already booked in s2)');
    assert.ok(ids.includes(aC3), 'C\'s s3 duty is a feasible target');

    // missing my_assignment_id → 400
    const noId = await request(app)
        .get(periodQuery(`${base}/swap-eligible`, periodS.id))
        .set('Authorization', bearer(A.token));
    assert.equal(noId.status, 400);

    // someone else's duty → 403
    const notMine = await request(app)
        .get(periodQuery(`${base}/swap-eligible`, periodS.id) + `&my_assignment_id=${aC3}`)
        .set('Authorization', bearer(A.token));
    assert.equal(notMine.status, 403);
});

// ── outgoing listing + status filters ────────────────────────────────────────
test('outgoing list reflects status filters across the lifecycle', async () => {
    const s1 = await slot();
    const s2 = await slot();
    const aA = await duty(s1, r1.id, A.id);
    const aB = await duty(s2, r2.id, B.id);

    const create = await request(app)
        .post(`${base}/swap-requests`)
        .set('Authorization', bearer(A.token))
        .send({ requester_assignment_id: aA, target_assignment_id: aB, period_id: periodS.id });
    const swapId = create.body.request.id;

    // While pending_peer it is "open".
    const open = await request(app)
        .get(periodQuery(`${base}/swap-requests/outgoing`, periodS.id) + `&status=open`)
        .set('Authorization', bearer(A.token));
    assert.ok(open.body.requests.some((r) => r.id === swapId), 'open filter shows pending request');

    // Drive it to terminal and confirm the terminal filter picks it up.
    await request(app).put(`${base}/swap-requests/${swapId}/peer-respond`)
        .set('Authorization', bearer(B.token)).send({ accept: true });
    await request(app).put(`${base}/swap-requests/${swapId}/admin-respond`)
        .set('Authorization', adminAuth()).send({ accept: true });

    const terminal = await request(app)
        .get(periodQuery(`${base}/swap-requests/outgoing`, periodS.id) + `&status=terminal`)
        .set('Authorization', bearer(A.token));
    const row = terminal.body.requests.find((r) => r.id === swapId);
    assert.ok(row && row.status === 'approved', 'terminal filter shows the approved request');

    const stillOpen = await request(app)
        .get(periodQuery(`${base}/swap-requests/outgoing`, periodS.id) + `&status=open`)
        .set('Authorization', bearer(A.token));
    assert.ok(!stillOpen.body.requests.some((r) => r.id === swapId), 'approved request left the open filter');
});

// ── ownership / validation guards ────────────────────────────────────────────
test('guards: cancel own pending, 403 for non-owners, 400 for self-swap/missing fields', async () => {
    const s1 = await slot();
    const s2 = await slot();
    const aA = await duty(s1, r1.id, A.id);
    const aB = await duty(s2, r2.id, B.id);

    // self-swap (my own two duties) → 400
    const aA2 = await duty(s2, r3.id, A.id);
    const selfSwap = await request(app)
        .post(`${base}/swap-requests`)
        .set('Authorization', bearer(A.token))
        .send({ requester_assignment_id: aA, target_assignment_id: aA2, period_id: periodS.id });
    assert.equal(selfSwap.status, 400, 'cannot swap with yourself');

    // missing target → 400
    const missing = await request(app)
        .post(`${base}/swap-requests`)
        .set('Authorization', bearer(A.token))
        .send({ requester_assignment_id: aA, period_id: periodS.id });
    assert.equal(missing.status, 400);

    // a real pending request for the 403 / cancel checks — on a FRESH slot pair
    // so A is not double-booked (the self-swap setup above put A in s2 already).
    const s3 = await slot();
    const s4 = await slot();
    const cA = await duty(s3, r1.id, A.id);
    const cB = await duty(s4, r2.id, B.id);
    const create = await request(app)
        .post(`${base}/swap-requests`)
        .set('Authorization', bearer(A.token))
        .send({ requester_assignment_id: cA, target_assignment_id: cB, period_id: periodS.id });
    const swapId = create.body.request.id;

    // C (not the target) cannot peer-respond → 403
    const wrongPeer = await request(app)
        .put(`${base}/swap-requests/${swapId}/peer-respond`)
        .set('Authorization', bearer(C.token))
        .send({ accept: true });
    assert.equal(wrongPeer.status, 403);

    // B (not the requester) cannot cancel → 403
    const wrongCancel = await request(app)
        .delete(`${base}/swap-requests/${swapId}`)
        .set('Authorization', bearer(B.token));
    assert.equal(wrongCancel.status, 403);

    // requester cancels their own pending request → cancelled
    const cancel = await request(app)
        .delete(`${base}/swap-requests/${swapId}`)
        .set('Authorization', bearer(A.token));
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.status, 'cancelled');

    // …and it can no longer be cancelled again (terminal) → 409
    const cancelAgain = await request(app)
        .delete(`${base}/swap-requests/${swapId}`)
        .set('Authorization', bearer(A.token));
    assert.equal(cancelAgain.status, 409);
});
