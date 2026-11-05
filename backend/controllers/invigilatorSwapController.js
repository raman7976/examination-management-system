// ═════════════════════════════════════════════════════════════════════════════
//  Invigilator swap-request controller
//
//  Two-way swap workflow:
//    1. Invigilator A picks one of their own duties + invigilator B's duty
//       (POST /swap-requests)            → status = pending_peer
//    2. Invigilator B approves
//       (PUT  /:id/peer-respond)         → status = pending_admin
//    3. Admin approves; swap is executed atomically
//       (PUT  /:id/admin-respond)        → status = approved [TERMINAL]
//
//  Rejection at either step is terminal. The requester may cancel while
//  status = pending_peer.
//
//  All endpoints default to the ACTIVE exam period — invigilators never see
//  or touch other periods.
// ═════════════════════════════════════════════════════════════════════════════
import db from '../config/mysql.js';
import { resolveActivePeriod, loadPeriod } from '../utils/periodResolver.js';
import { isInstructorForRoom, loadScheduleGrid } from './invigilatorSchedulingController.js';

// Tiny helper — throw an Error with a `.http` status so the catch can map it.
const httpErr = (status, message) => Object.assign(new Error(message), { http: status });

// ─────────────────────────────────────────────────────────────────────────────
//  Shared SELECT fragments
//
//  Most "list" endpoints want one row per swap-request decorated with names
//  and slot/room context for BOTH sides. Centralising the SELECT keeps the
//  shape consistent across incoming / outgoing / admin views.
// ─────────────────────────────────────────────────────────────────────────────

// One swap row joined with both users' names and both assignments' slot+room.
// The slot/room/course aggregation mirrors getSchedule's join pattern.
const SWAP_DETAIL_SELECT = `
    SELECT
        sr.id,
        sr.exam_period_id,
        sr.status,
        sr.request_type,
        sr.note,
        sr.created_at,
        sr.peer_responded_at,
        sr.admin_responded_at,
        sr.cancelled_at,

        sr.requester_user_id,
        ru.full_name   AS requester_name,
        ru.role        AS requester_role,
        ru.employee_id AS requester_emp_id,

        sr.target_user_id,
        tu.full_name   AS target_name,
        tu.role        AS target_role,
        tu.employee_id AS target_emp_id,

        sr.requester_assignment_id,
        ra.slot_id     AS requester_slot_id,
        ra.classroom_id AS requester_classroom_id,
        rs.exam_date   AS requester_exam_date,
        rs.exam_day    AS requester_exam_day,
        rs.start_time  AS requester_start_time,
        rs.end_time    AS requester_end_time,
        rc.room_name   AS requester_room_name,

        sr.target_assignment_id,
        ta.slot_id     AS target_slot_id,
        ta.classroom_id AS target_classroom_id,
        ts.exam_date   AS target_exam_date,
        ts.exam_day    AS target_exam_day,
        ts.start_time  AS target_start_time,
        ts.end_time    AS target_end_time,
        tc.room_name   AS target_room_name
    FROM invigilator_swap_requests sr
    JOIN users ru ON ru.id = sr.requester_user_id
    JOIN users tu ON tu.id = sr.target_user_id
    JOIN invigilator_assignments ra ON ra.id = sr.requester_assignment_id
    JOIN exam_slots rs   ON rs.id = ra.slot_id
    JOIN classrooms rc   ON rc.id = ra.classroom_id
    LEFT JOIN invigilator_assignments ta ON ta.id = sr.target_assignment_id
    LEFT JOIN exam_slots ts   ON ts.id = ta.slot_id
    LEFT JOIN classrooms tc   ON tc.id = ta.classroom_id
`;

// Fetch course_codes per (slot_id, classroom_id) — used as a sidecar lookup
// so we can attach them to swap rows without a 9-table JOIN. Same aggregation
// shape getSchedule uses.
async function fetchCoursesByRoom(connOrDb, slotClassroomPairs) {
    if (slotClassroomPairs.length === 0) return new Map();
    const c = connOrDb || db;
    const slotIds = [...new Set(slotClassroomPairs.map(p => p.slot_id))];
    if (slotIds.length === 0) return new Map();
    const ph = slotIds.map(() => '?').join(',');
    const [rows] = await c.query(
        `SELECT se.slot_id, sa.classroom_id,
                GROUP_CONCAT(DISTINCT se.course_code SEPARATOR ', ') AS course_codes
         FROM seating_allocations sa
         JOIN scheduled_exams se ON sa.scheduled_exam_id = se.id
         WHERE se.slot_id IN (${ph})
         GROUP BY se.slot_id, sa.classroom_id`,
        slotIds
    );
    const map = new Map();
    for (const r of rows) map.set(`${r.slot_id}|${r.classroom_id}`, r.course_codes);
    return map;
}

// Shape a swap row from the DETAIL_SELECT into the JSON we ship.
function shapeSwap(row, coursesByRoom) {
    const reqKey = `${row.requester_slot_id}|${row.requester_classroom_id}`;
    const tgtKey = `${row.target_slot_id}|${row.target_classroom_id}`;
    return {
        id: row.id,
        status: row.status,
        request_type: row.request_type || 'swap',
        note: row.note,
        created_at: row.created_at,
        peer_responded_at: row.peer_responded_at,
        admin_responded_at: row.admin_responded_at,
        cancelled_at: row.cancelled_at,
        requester: {
            user_id:        row.requester_user_id,
            full_name:      row.requester_name,
            role:           row.requester_role,
            employee_id:    row.requester_emp_id,
            assignment_id:  row.requester_assignment_id,
            slot_id:        row.requester_slot_id,
            classroom_id:   row.requester_classroom_id,
            exam_date:      row.requester_exam_date,
            exam_day:       row.requester_exam_day,
            start_time:     row.requester_start_time,
            end_time:       row.requester_end_time,
            room_name:      row.requester_room_name,
            course_codes:   coursesByRoom.get(reqKey) || '',
        },
        target: {
            user_id:        row.target_user_id,
            full_name:      row.target_name,
            role:           row.target_role,
            employee_id:    row.target_emp_id,
            assignment_id:  row.target_assignment_id,
            slot_id:        row.target_slot_id,
            classroom_id:   row.target_classroom_id,
            exam_date:      row.target_exam_date,
            exam_day:       row.target_exam_day,
            start_time:     row.target_start_time,
            end_time:       row.target_end_time,
            room_name:      row.target_room_name,
            course_codes:   coursesByRoom.get(tgtKey) || '',
        },
    };
}

async function decorateSwaps(connOrDb, rows) {
    if (rows.length === 0) return [];
    const pairs = [];
    for (const r of rows) {
        pairs.push({ slot_id: r.requester_slot_id, classroom_id: r.requester_classroom_id });
        pairs.push({ slot_id: r.target_slot_id,    classroom_id: r.target_classroom_id });
    }
    const coursesByRoom = await fetchCoursesByRoom(connOrDb, pairs);
    return rows.map(r => shapeSwap(r, coursesByRoom));
}

// ═════════════════════════════════════════════════════════════════════════════
//  GET /my-schedule  (invigilator)
//
//  My duties in the active period. Same shape as getSchedule but flattened
//  to a duties[] array — every row is one of MY assignments.
// ═════════════════════════════════════════════════════════════════════════════
export const getMySchedule = async (req, res) => {
    try {
        const periodId = await resolveActivePeriod(null, req.query.period_id);
        const period = await loadPeriod(null, periodId);

        const [rows] = await db.query(
            `SELECT ia.id              AS assignment_id,
                    ia.slot_id,
                    ia.classroom_id,
                    ia.is_course_instructor,
                    es.exam_date,
                    es.exam_day,
                    es.start_time,
                    es.end_time,
                    cl.room_name
             FROM invigilator_assignments ia
             JOIN exam_slots es  ON ia.slot_id = es.id
             JOIN classrooms cl  ON ia.classroom_id = cl.id
             WHERE ia.user_id = ? AND ia.exam_period_id = ?
             ORDER BY es.exam_date, es.start_time, cl.location_order`,
            [req.user.id, periodId]
        );

        const coursesByRoom = await fetchCoursesByRoom(
            null,
            rows.map(r => ({ slot_id: r.slot_id, classroom_id: r.classroom_id }))
        );

        const duties = rows.map(r => ({
            assignment_id:        r.assignment_id,
            slot_id:              r.slot_id,
            classroom_id:         r.classroom_id,
            exam_date:            r.exam_date,
            exam_day:             r.exam_day,
            start_time:           r.start_time,
            end_time:             r.end_time,
            room_name:            r.room_name,
            course_codes:         coursesByRoom.get(`${r.slot_id}|${r.classroom_id}`) || '',
            is_course_instructor: !!r.is_course_instructor,
        }));

        res.json({ success: true, exam_period: period, duties });
    } catch (err) {
        const status = err.http || 500;
        console.error('getMySchedule error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to load schedule.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /full-schedule  (invigilator)
//
//  The WHOLE published grid for the active period — every slot, every room,
//  every assigned invigilator (name + employee_id + ★). Read-only. Each
//  invigilator chip carries `is_me` so the portal can highlight my own duties
//  and decide which cells are valid swap targets. Mirrors the admin
//  getSchedule shape (slots[] → rooms[] → invigilators[]).
// ═════════════════════════════════════════════════════════════════════════════
export const getFullSchedule = async (req, res) => {
    try {
        const periodId = await resolveActivePeriod(null, req.query.period_id);
        const period = await loadPeriod(null, periodId);

        // Same grid builder as the admin getSchedule, so both views match exactly.
        const schedule = await loadScheduleGrid(null, periodId, { meUserId: req.user.id });
        res.json({ success: true, exam_period: period, schedule });
    } catch (err) {
        const status = err.http || 500;
        console.error('getFullSchedule error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to load schedule.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /swap-eligible?my_assignment_id=X  (invigilator)
//
//  Returns every OTHER invigilator's assignment that I could legally swap
//  into — meaning the post-swap state respects UNIQUE(slot_id, user_id,
//  exam_period_id) on both sides. Same-slot/different-room candidates pass
//  trivially (the `id != …` exclusion lets them through).
// ═════════════════════════════════════════════════════════════════════════════
export const listSwapEligibleTargets = async (req, res) => {
    try {
        const myAssignmentId = Number(req.query.my_assignment_id);
        if (!myAssignmentId) throw httpErr(400, 'my_assignment_id is required.');

        const periodId = await resolveActivePeriod(null, req.query.period_id);

        // 1. Verify the assignment belongs to me, in the active period.
        const [[mine]] = await db.query(
            `SELECT id, slot_id, classroom_id, user_id, exam_period_id
             FROM invigilator_assignments WHERE id = ?`,
            [myAssignmentId]
        );
        if (!mine)                                    throw httpErr(404, 'Assignment not found.');
        if (mine.user_id !== req.user.id)             throw httpErr(403, 'That duty is not yours.');
        if (mine.exam_period_id !== periodId)         throw httpErr(409, 'Duty is not in the active period.');

        // 2. Candidate set = every OTHER user's assignment in this period.
        //    Feasibility filter applied via NOT EXISTS subqueries.
        const [rows] = await db.query(
            `SELECT ia.id              AS assignment_id,
                    ia.slot_id,
                    ia.classroom_id,
                    ia.is_course_instructor,
                    ia.user_id,
                    u.full_name,
                    u.role,
                    u.employee_id,
                    u.department,
                    es.exam_date,
                    es.exam_day,
                    es.start_time,
                    es.end_time,
                    cl.room_name
             FROM invigilator_assignments ia
             JOIN users u       ON u.id = ia.user_id
             JOIN exam_slots es ON es.id = ia.slot_id
             JOIN classrooms cl ON cl.id = ia.classroom_id
             WHERE ia.exam_period_id = ?
               AND ia.user_id        != ?
               AND NOT EXISTS (
                   SELECT 1 FROM invigilator_assignments x
                   WHERE x.exam_period_id = ia.exam_period_id
                     AND x.slot_id        = ia.slot_id
                     AND x.user_id        = ?
                     AND x.id             != ?
               )
               AND NOT EXISTS (
                   SELECT 1 FROM invigilator_assignments y
                   WHERE y.exam_period_id = ia.exam_period_id
                     AND y.slot_id        = ?
                     AND y.user_id        = ia.user_id
                     AND y.id             != ia.id
               )
             ORDER BY es.exam_date, es.start_time, u.full_name`,
            [periodId, req.user.id, req.user.id, myAssignmentId, mine.slot_id]
        );

        const coursesByRoom = await fetchCoursesByRoom(
            null,
            rows.map(r => ({ slot_id: r.slot_id, classroom_id: r.classroom_id }))
        );

        const eligible = rows.map(r => ({
            assignment_id:        r.assignment_id,
            slot_id:              r.slot_id,
            classroom_id:         r.classroom_id,
            exam_date:            r.exam_date,
            exam_day:             r.exam_day,
            start_time:           r.start_time,
            end_time:             r.end_time,
            room_name:            r.room_name,
            course_codes:         coursesByRoom.get(`${r.slot_id}|${r.classroom_id}`) || '',
            is_course_instructor: !!r.is_course_instructor,
            other_user: {
                user_id:     r.user_id,
                full_name:   r.full_name,
                role:        r.role,
                employee_id: r.employee_id,
                department:  r.department,
            },
        }));

        res.json({ success: true, my_assignment_id: myAssignmentId, eligible });
    } catch (err) {
        const status = err.http || 500;
        if (!err.http) console.error('listSwapEligibleTargets error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to list swap targets.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  POST /swap-requests  (invigilator)
//
//  Two request types, both inserted as pending_peer:
//
//   • request_type = 'swap'  (default) — a two-way trade. Needs
//     requester_assignment_id + target_assignment_id. On approval the two
//     duties exchange occupants.
//
//   • request_type = 'cover' — I hand my duty entirely to another person.
//     Needs requester_assignment_id + target_user_id (no target duty). On
//     approval my assignment is reassigned to the target, who then does both
//     their own duty and mine; my duty count drops, so the carryover marks me
//     as owing one in the next exam-period generation.
//
//  All validation runs FOR UPDATE so racing requests serialise cleanly.
// ═════════════════════════════════════════════════════════════════════════════
export const createSwapRequest = async (req, res) => {
    const requestType = (req.body?.request_type || 'swap').toLowerCase();
    if (!['swap', 'cover'].includes(requestType))
        return res.status(400).json({ success: false, message: `Unknown request_type: ${requestType}` });

    return requestType === 'cover'
        ? createCoverRequest(req, res)
        : createTwoWaySwapRequest(req, res);
};

// ── 'swap' — two-way trade ───────────────────────────────────────────────────
async function createTwoWaySwapRequest(req, res) {
    const { requester_assignment_id, target_assignment_id, note } = req.body || {};
    if (!requester_assignment_id || !target_assignment_id)
        return res.status(400).json({ success: false, message: 'requester_assignment_id and target_assignment_id are required.' });
    if (requester_assignment_id === target_assignment_id)
        return res.status(400).json({ success: false, message: 'Cannot swap a duty with itself.' });

    const conn = await db.getConnection();
    try {
        const periodId = await resolveActivePeriod(conn, req.body.period_id);
        await conn.beginTransaction();

        // 1. Lock both assignment rows in id-asc order (deadlock-safe).
        const ids = [Number(requester_assignment_id), Number(target_assignment_id)].sort((a, b) => a - b);
        const [rows] = await conn.query(
            `SELECT id, slot_id, classroom_id, user_id, exam_period_id
             FROM invigilator_assignments WHERE id IN (?, ?) FOR UPDATE`,
            ids
        );
        if (rows.length !== 2) throw httpErr(404, 'One or both assignments not found.');
        const reqA = rows.find(r => r.id === Number(requester_assignment_id));
        const tgtA = rows.find(r => r.id === Number(target_assignment_id));

        if (reqA.user_id !== req.user.id)   throw httpErr(403, 'The first duty is not yours.');
        if (tgtA.user_id === req.user.id)   throw httpErr(400, 'Cannot swap with yourself.');
        if (reqA.exam_period_id !== periodId || tgtA.exam_period_id !== periodId)
            throw httpErr(409, 'Both duties must be in the active exam period.');

        // 2. Duplicate-pair guard — no active non-terminal request already exists.
        const [[dup]] = await conn.query(
            `SELECT id FROM invigilator_swap_requests
             WHERE requester_assignment_id = ? AND target_assignment_id = ?
               AND status IN ('pending_peer','pending_admin')
             LIMIT 1 FOR UPDATE`,
            [reqA.id, tgtA.id]
        );
        if (dup) throw httpErr(409, 'An active swap request already exists for this pair.');

        // 3. Feasibility re-check — same NOT EXISTS pair the /swap-eligible filter applies.
        if (reqA.slot_id !== tgtA.slot_id) {
            const [c1] = await conn.query(
                `SELECT 1 FROM invigilator_assignments
                 WHERE slot_id = ? AND user_id = ? AND exam_period_id = ? AND id != ?`,
                [tgtA.slot_id, reqA.user_id, periodId, tgtA.id]
            );
            const [c2] = await conn.query(
                `SELECT 1 FROM invigilator_assignments
                 WHERE slot_id = ? AND user_id = ? AND exam_period_id = ? AND id != ?`,
                [reqA.slot_id, tgtA.user_id, periodId, reqA.id]
            );
            if (c1.length || c2.length)
                throw httpErr(409, 'Swap would place a person in two rooms in the same slot.');
        }

        // 4. Insert the request.
        const [ins] = await conn.query(
            `INSERT INTO invigilator_swap_requests
                 (exam_period_id, requester_user_id, target_user_id,
                  requester_assignment_id, target_assignment_id, request_type, status, note)
             VALUES (?, ?, ?, ?, ?, 'swap', 'pending_peer', ?)`,
            [periodId, reqA.user_id, tgtA.user_id, reqA.id, tgtA.id, note || null]
        );

        // 5. Re-read with the detail SELECT so the response carries names + slot/room.
        const [detail] = await conn.query(
            `${SWAP_DETAIL_SELECT} WHERE sr.id = ?`,
            [ins.insertId]
        );

        await conn.commit();
        const decorated = await decorateSwaps(null, detail);
        res.status(201).json({ success: true, request: decorated[0] });
    } catch (err) {
        await conn.rollback().catch(() => {});
        const status = err.http || 500;
        if (!err.http) console.error('createTwoWaySwapRequest error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to create swap request.' });
    } finally {
        conn.release();
    }
}

// ── 'cover' — hand my duty entirely to another person ────────────────────────
async function createCoverRequest(req, res) {
    const { requester_assignment_id, target_user_id, note } = req.body || {};
    if (!requester_assignment_id || !target_user_id)
        return res.status(400).json({ success: false, message: 'requester_assignment_id and target_user_id are required for a cover request.' });
    if (Number(target_user_id) === req.user.id)
        return res.status(400).json({ success: false, message: 'You cannot ask yourself to cover your own duty.' });

    const conn = await db.getConnection();
    try {
        const periodId = await resolveActivePeriod(conn, req.body.period_id);
        await conn.beginTransaction();

        // 1. Lock my duty.
        const [[reqA]] = await conn.query(
            `SELECT id, slot_id, classroom_id, user_id, exam_period_id
             FROM invigilator_assignments WHERE id = ? FOR UPDATE`,
            [Number(requester_assignment_id)]
        );
        if (!reqA)                              throw httpErr(404, 'Your duty was not found.');
        if (reqA.user_id !== req.user.id)       throw httpErr(403, 'That duty is not yours.');
        if (reqA.exam_period_id !== periodId)   throw httpErr(409, 'Duty is not in the active exam period.');

        // 2. Target must be a real non-admin invigilator.
        const [[target]] = await conn.query(
            "SELECT id FROM users WHERE id = ? AND role != 'admin'",
            [Number(target_user_id)]
        );
        if (!target) throw httpErr(404, 'Target invigilator not found.');

        // 3. Target must be FREE in my duty's slot (else covering double-books them).
        const [conflict] = await conn.query(
            `SELECT 1 FROM invigilator_assignments
             WHERE slot_id = ? AND user_id = ? AND exam_period_id = ?`,
            [reqA.slot_id, Number(target_user_id), periodId]
        );
        if (conflict.length)
            throw httpErr(409, 'That person already has a duty in the same slot, so they cannot cover this one.');

        // 4. Duplicate guard — no active cover request for this duty + person.
        const [[dup]] = await conn.query(
            `SELECT id FROM invigilator_swap_requests
             WHERE requester_assignment_id = ? AND target_user_id = ? AND request_type = 'cover'
               AND status IN ('pending_peer','pending_admin')
             LIMIT 1 FOR UPDATE`,
            [reqA.id, Number(target_user_id)]
        );
        if (dup) throw httpErr(409, 'You already have an active cover request for this duty with that person.');

        // 5. Insert (target_assignment_id stays NULL for covers).
        const [ins] = await conn.query(
            `INSERT INTO invigilator_swap_requests
                 (exam_period_id, requester_user_id, target_user_id,
                  requester_assignment_id, target_assignment_id, request_type, status, note)
             VALUES (?, ?, ?, ?, NULL, 'cover', 'pending_peer', ?)`,
            [periodId, reqA.user_id, Number(target_user_id), reqA.id, note || null]
        );

        const [detail] = await conn.query(`${SWAP_DETAIL_SELECT} WHERE sr.id = ?`, [ins.insertId]);

        await conn.commit();
        const decorated = await decorateSwaps(null, detail);
        res.status(201).json({ success: true, request: decorated[0] });
    } catch (err) {
        await conn.rollback().catch(() => {});
        const status = err.http || 500;
        if (!err.http) console.error('createCoverRequest error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to create cover request.' });
    } finally {
        conn.release();
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  GET /swap-requests/incoming  (invigilator)
//  Requests sent TO me, currently awaiting my response.
// ═════════════════════════════════════════════════════════════════════════════
export const listIncomingSwapRequests = async (req, res) => {
    try {
        const periodId = await resolveActivePeriod(null, req.query.period_id);
        const [rows] = await db.query(
            `${SWAP_DETAIL_SELECT}
             WHERE sr.target_user_id  = ?
               AND sr.exam_period_id  = ?
               AND sr.status          = 'pending_peer'
             ORDER BY sr.created_at DESC`,
            [req.user.id, periodId]
        );
        const requests = await decorateSwaps(null, rows);
        res.json({ success: true, requests });
    } catch (err) {
        const status = err.http || 500;
        console.error('listIncomingSwapRequests error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to list incoming requests.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /swap-requests/outgoing[?status=open|terminal]  (invigilator)
//  Requests I created, any status (with optional filter).
// ═════════════════════════════════════════════════════════════════════════════
export const listOutgoingSwapRequests = async (req, res) => {
    try {
        const periodId = await resolveActivePeriod(null, req.query.period_id);
        const filter = (req.query.status || '').toLowerCase();
        let statusClause = '';
        const params = [req.user.id, periodId];
        if (filter === 'open') {
            statusClause = `AND sr.status IN ('pending_peer','pending_admin')`;
        } else if (filter === 'terminal') {
            statusClause = `AND sr.status IN ('approved','rejected_by_peer','rejected_by_admin','cancelled')`;
        }
        const [rows] = await db.query(
            `${SWAP_DETAIL_SELECT}
             WHERE sr.requester_user_id = ?
               AND sr.exam_period_id    = ?
               ${statusClause}
             ORDER BY sr.created_at DESC`,
            params
        );
        const requests = await decorateSwaps(null, rows);
        res.json({ success: true, requests });
    } catch (err) {
        const status = err.http || 500;
        console.error('listOutgoingSwapRequests error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to list outgoing requests.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  PUT /swap-requests/:id/peer-respond  (invigilator)
//  Body: { accept: bool, note?: string }
//
//  Accept → status = pending_admin (admin must still approve before swap fires).
//  Reject → status = rejected_by_peer [terminal].
// ═════════════════════════════════════════════════════════════════════════════
export const peerRespondToSwap = async (req, res) => {
    const id = Number(req.params.id);
    const accept = !!req.body?.accept;
    const note = req.body?.note;
    if (!id) return res.status(400).json({ success: false, message: 'id is required.' });

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[swap]] = await conn.query(
            `SELECT id, target_user_id, status FROM invigilator_swap_requests WHERE id = ? FOR UPDATE`,
            [id]
        );
        if (!swap)                                    throw httpErr(404, 'Swap request not found.');
        if (swap.target_user_id !== req.user.id)      throw httpErr(403, 'You are not the target of this request.');
        if (swap.status !== 'pending_peer')           throw httpErr(409, `Request is no longer awaiting your response (status: ${swap.status}).`);

        const nextStatus = accept ? 'pending_admin' : 'rejected_by_peer';
        await conn.query(
            `UPDATE invigilator_swap_requests
             SET status = ?, peer_responded_at = NOW(), note = COALESCE(?, note)
             WHERE id = ?`,
            [nextStatus, note || null, id]
        );

        await conn.commit();
        res.json({ success: true, status: nextStatus });
    } catch (err) {
        await conn.rollback().catch(() => {});
        const status = err.http || 500;
        if (!err.http) console.error('peerRespondToSwap error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to respond to swap request.' });
    } finally {
        conn.release();
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  DELETE /swap-requests/:id  (invigilator) — cancel my own pending_peer request.
// ═════════════════════════════════════════════════════════════════════════════
export const cancelOwnSwapRequest = async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'id is required.' });

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[swap]] = await conn.query(
            `SELECT id, requester_user_id, status FROM invigilator_swap_requests WHERE id = ? FOR UPDATE`,
            [id]
        );
        if (!swap)                                       throw httpErr(404, 'Swap request not found.');
        if (swap.requester_user_id !== req.user.id)      throw httpErr(403, 'Only the requester can cancel.');
        if (swap.status !== 'pending_peer')               throw httpErr(409, `Request is no longer cancellable (status: ${swap.status}).`);

        await conn.query(
            `UPDATE invigilator_swap_requests
             SET status = 'cancelled', cancelled_at = NOW()
             WHERE id = ?`,
            [id]
        );
        await conn.commit();
        res.json({ success: true, status: 'cancelled' });
    } catch (err) {
        await conn.rollback().catch(() => {});
        const status = err.http || 500;
        if (!err.http) console.error('cancelOwnSwapRequest error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to cancel swap request.' });
    } finally {
        conn.release();
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /swap-requests[?status=]  (admin)
//
//  Admin sees every request — by default the pending_admin queue; passing
//  ?status=all (or any explicit status) widens the view for history.
// ═════════════════════════════════════════════════════════════════════════════
const ALLOWED_ADMIN_STATUSES = new Set([
    'pending_peer', 'pending_admin', 'approved',
    'rejected_by_peer', 'rejected_by_admin', 'cancelled', 'all',
]);

export const listSwapRequestsAdmin = async (req, res) => {
    try {
        const periodId = await resolveActivePeriod(null, req.query.period_id);
        const requested = (req.query.status || 'pending_admin').toLowerCase();
        if (!ALLOWED_ADMIN_STATUSES.has(requested))
            return res.status(400).json({ success: false, message: `Unknown status filter: ${requested}` });

        const params = [periodId];
        let statusClause = '';
        if (requested !== 'all') {
            statusClause = `AND sr.status = ?`;
            params.push(requested);
        }
        const [rows] = await db.query(
            `${SWAP_DETAIL_SELECT}
             WHERE sr.exam_period_id = ? ${statusClause}
             ORDER BY (sr.status = 'pending_admin') DESC, sr.created_at DESC`,
            params
        );
        const requests = await decorateSwaps(null, rows);
        res.json({ success: true, requests });
    } catch (err) {
        const status = err.http || 500;
        console.error('listSwapRequestsAdmin error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to list swap requests.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  PUT /swap-requests/:id/admin-respond  (admin)
//  Body: { accept: bool, note?: string }
//
//  Approve → execute the swap atomically:
//    • Lock the swap row + both assignment rows (FOR UPDATE).
//    • Defensive re-validation (identities still match, no period drift,
//      no post-swap collision against other rows).
//    • Swap user_id between the two assignment rows (slot+room stay put).
//    • Recompute is_course_instructor for each row at its NEW user.
//    • Mark request approved.
//  If any defensive check fails the request is auto-marked rejected_by_admin
//  with a system note explaining why — the transaction commits cleanly.
//
//  Reject → terminal `rejected_by_admin`, assignments untouched.
// ═════════════════════════════════════════════════════════════════════════════
export const adminRespondToSwap = async (req, res) => {
    const id = Number(req.params.id);
    const accept = !!req.body?.accept;
    const adminNote = req.body?.note;
    if (!id) return res.status(400).json({ success: false, message: 'id is required.' });

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Lock the swap row, gate on status.
        const [[swap]] = await conn.query(
            `SELECT * FROM invigilator_swap_requests WHERE id = ? FOR UPDATE`,
            [id]
        );
        if (!swap)                                      throw httpErr(404, 'Swap request not found.');
        if (swap.status !== 'pending_admin')            throw httpErr(409, `Request is not awaiting admin approval (status: ${swap.status}).`);

        // ── REJECT path ─────────────────────────────────────────────────────
        if (!accept) {
            await conn.query(
                `UPDATE invigilator_swap_requests
                 SET status = 'rejected_by_admin', admin_responded_at = NOW(),
                     note = COALESCE(?, note)
                 WHERE id = ?`,
                [adminNote || null, id]
            );
            await conn.commit();
            return res.json({ success: true, status: 'rejected_by_admin' });
        }

        // ── APPROVE path — defensive validation, then execute ───────────────

        // Helper to fail defensively WITHOUT rolling back: commit a
        // `rejected_by_admin` with a system note so the audit trail captures
        // why the schedule moved underneath the request.
        const failDefensively = async (reason) => {
            await conn.query(
                `UPDATE invigilator_swap_requests
                 SET status = 'rejected_by_admin', admin_responded_at = NOW(),
                     note = ?
                 WHERE id = ?`,
                [reason, id]
            );
            await conn.commit();
            return res.status(409).json({ success: false, message: reason, status: 'rejected_by_admin' });
        };

        // ── COVER: reassign the requester's duty entirely to the target ─────
        //  Only the requester's row moves (target keeps their own duty and
        //  absorbs this one). The requester's duty count drops, so carryover
        //  marks them as owing one in the next exam-period generation.
        if (swap.request_type === 'cover') {
            const [[reqA]] = await conn.query(
                `SELECT id, slot_id, classroom_id, user_id, exam_period_id
                 FROM invigilator_assignments WHERE id = ? FOR UPDATE`,
                [swap.requester_assignment_id]
            );
            if (!reqA)                                       return failDefensively('The duty being covered no longer exists.');
            if (reqA.user_id !== swap.requester_user_id)     return failDefensively('Requester has been reassigned since the request was created.');
            if (reqA.exam_period_id !== swap.exam_period_id) return failDefensively('Underlying duty has moved to a different exam period.');

            // Target must still be free in that slot (no double-booking).
            const [conflict] = await conn.query(
                `SELECT 1 FROM invigilator_assignments
                 WHERE slot_id = ? AND user_id = ? AND exam_period_id = ? AND id != ?`,
                [reqA.slot_id, swap.target_user_id, swap.exam_period_id, reqA.id]
            );
            if (conflict.length)
                return failDefensively('Target now has a duty in that slot, so they can no longer cover this one.');

            // Reassign the duty to the target; recompute ★ for them in that room.
            const tgtIsInstr = await isInstructorForRoom(conn, swap.target_user_id, reqA.slot_id, reqA.classroom_id);
            await conn.query(
                `UPDATE invigilator_assignments
                 SET user_id = ?, is_course_instructor = ?
                 WHERE id = ?`,
                [swap.target_user_id, tgtIsInstr ? 1 : 0, reqA.id]
            );
            await conn.query(
                `UPDATE invigilator_swap_requests
                 SET status = 'approved', admin_responded_at = NOW(), note = COALESCE(?, note)
                 WHERE id = ?`,
                [adminNote || null, id]
            );
            await conn.commit();
            return res.json({ success: true, status: 'approved', message: 'Cover approved — duty reassigned to the volunteer.' });
        }

        // ── SWAP: two-way trade ──────────────────────────────────────────────
        // 2. Lock both assignment rows in id-asc order (deadlock-safe).
        const ids = [swap.requester_assignment_id, swap.target_assignment_id].sort((a, b) => a - b);
        const [aRows] = await conn.query(
            `SELECT id, slot_id, classroom_id, user_id, exam_period_id
             FROM invigilator_assignments WHERE id IN (?, ?) FOR UPDATE`,
            ids
        );

        if (aRows.length !== 2) {
            return failDefensively('One or both underlying assignments no longer exist.');
        }
        const reqA = aRows.find(r => r.id === swap.requester_assignment_id);
        const tgtA = aRows.find(r => r.id === swap.target_assignment_id);

        // 3. Identity / period drift checks.
        if (reqA.user_id !== swap.requester_user_id)
            return failDefensively('Requester has been reassigned since the request was created.');
        if (tgtA.user_id !== swap.target_user_id)
            return failDefensively('Target has been reassigned since the request was created.');
        if (reqA.exam_period_id !== swap.exam_period_id || tgtA.exam_period_id !== swap.exam_period_id)
            return failDefensively('Underlying duty has moved to a different exam period.');

        // 4. Post-swap collision check (only matters when slots differ).
        if (reqA.slot_id !== tgtA.slot_id) {
            const [c1] = await conn.query(
                `SELECT 1 FROM invigilator_assignments
                 WHERE slot_id = ? AND user_id = ? AND exam_period_id = ? AND id != ?`,
                [tgtA.slot_id, reqA.user_id, swap.exam_period_id, tgtA.id]
            );
            const [c2] = await conn.query(
                `SELECT 1 FROM invigilator_assignments
                 WHERE slot_id = ? AND user_id = ? AND exam_period_id = ? AND id != ?`,
                [reqA.slot_id, tgtA.user_id, swap.exam_period_id, reqA.id]
            );
            if (c1.length || c2.length)
                return failDefensively('Swap would place a person in two rooms in the same slot.');
        }

        // 5 + 6. Execute the swap. The mechanism depends on whether the two
        //  duties share a slot, because uq_slot_user = (slot_id, user_id,
        //  exam_period_id) is checked PER ROW as each UPDATE runs:
        //
        //   • Different slots → swap user_id. Feasibility was re-validated in
        //     step 4, so neither row transiently duplicates a (slot, user) key.
        //
        //   • Same slot → swapping user_id would, after the FIRST update, leave
        //     BOTH rows at (slot, target_user) until the second update lands —
        //     tripping uq_slot_user mid-transaction. Instead we swap the
        //     classroom_id (and ★ flag): user_id never changes, so the unique
        //     key can never collide, and the end state (each person in the
        //     other's room) is identical to a user_id swap.
        if (reqA.slot_id === tgtA.slot_id) {
            // reqA keeps its user, moves into tgtA's room; tgtA vice-versa.
            const reqIsInstr = await isInstructorForRoom(conn, reqA.user_id, reqA.slot_id, tgtA.classroom_id);
            const tgtIsInstr = await isInstructorForRoom(conn, tgtA.user_id, tgtA.slot_id, reqA.classroom_id);
            await conn.query(
                `UPDATE invigilator_assignments
                 SET classroom_id = ?, is_course_instructor = ?
                 WHERE id = ?`,
                [tgtA.classroom_id, reqIsInstr ? 1 : 0, reqA.id]
            );
            await conn.query(
                `UPDATE invigilator_assignments
                 SET classroom_id = ?, is_course_instructor = ?
                 WHERE id = ?`,
                [reqA.classroom_id, tgtIsInstr ? 1 : 0, tgtA.id]
            );
        } else {
            // Recompute ★ flag for the NEW occupant of each row.
            const reqIsInstr = await isInstructorForRoom(conn, swap.target_user_id,    reqA.slot_id, reqA.classroom_id);
            const tgtIsInstr = await isInstructorForRoom(conn, swap.requester_user_id, tgtA.slot_id, tgtA.classroom_id);
            await conn.query(
                `UPDATE invigilator_assignments
                 SET user_id = ?, is_course_instructor = ?
                 WHERE id = ?`,
                [swap.target_user_id, reqIsInstr ? 1 : 0, reqA.id]
            );
            await conn.query(
                `UPDATE invigilator_assignments
                 SET user_id = ?, is_course_instructor = ?
                 WHERE id = ?`,
                [swap.requester_user_id, tgtIsInstr ? 1 : 0, tgtA.id]
            );
        }

        // 7. Mark request approved.
        await conn.query(
            `UPDATE invigilator_swap_requests
             SET status = 'approved', admin_responded_at = NOW(),
                 note = COALESCE(?, note)
             WHERE id = ?`,
            [adminNote || null, id]
        );

        await conn.commit();
        res.json({ success: true, status: 'approved', message: 'Swap approved and executed.' });
    } catch (err) {
        await conn.rollback().catch(() => {});
        const status = err.http || 500;
        if (!err.http) console.error('adminRespondToSwap error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to respond to swap request.' });
    } finally {
        conn.release();
    }
};
