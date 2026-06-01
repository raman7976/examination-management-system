import db from '../config/mysql.js';
import { runInvigilatorAlgorithm } from '../utils/invigilatorAlgorithm.js';
import { resolveActivePeriod, loadPeriod } from '../utils/periodResolver.js';

const VALID_ROLES = ['faculty', 'phd_student', 'lab_staff'];

// ─────────────────────────────────────────────────────────────────────────────
//  Is `userId` an instructor for any course currently being held in room
//  (classroomId) during slot (slotId)? Used by add/reassign to preserve the
//  ★ badge on chips when the new occupant also teaches there.
// ─────────────────────────────────────────────────────────────────────────────
// Exported so the swap controller can re-evaluate the ★ badge for the NEW
// occupant of each room after an approved swap.
export async function isInstructorForRoom(connOrDb, userId, slotId, classroomId) {
    const c = connOrDb || db;
    const [rows] = await c.query(`
        SELECT 1
        FROM   scheduled_exams      se
        JOIN   seating_allocations  sa ON sa.scheduled_exam_id = se.id
        JOIN   exam_slots           es ON se.slot_id = es.id
        JOIN   exam_periods         ep ON ep.id = es.exam_period_id
        JOIN   course_instructors   ci ON ci.course_code = se.course_code AND ci.semester_label = ep.semester_label
        JOIN   users                u  ON u.employee_id = ci.employee_id AND u.role != 'admin'
        WHERE  se.slot_id      = ?
          AND  sa.classroom_id = ?
          AND  u.id            = ?
        LIMIT 1
    `, [slotId, classroomId, userId]);
    return rows.length > 0;
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXAM-PERIOD CRUD
// ═════════════════════════════════════════════════════════════════════════════

// GET /exam-periods — list all periods, active first then by created_at DESC
export const listExamPeriods = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, semester_label, exam_type, is_active, created_at
             FROM exam_periods
             ORDER BY is_active DESC, created_at DESC`
        );
        res.json({ success: true, periods: rows });
    } catch (err) {
        console.error('listExamPeriods error:', err);
        res.status(500).json({ success: false, message: 'Failed to list exam periods.' });
    }
};

// POST /semesters — body { semester_label, activate_midterm? = true }
// Creates BOTH (label, 'midterm') and (label, 'endterm') in one transaction.
// Skips rows that already exist (so it's safe to call on a semester that has
// only one period — completes the pair). Optionally activates midterm.
export const createSemester = async (req, res) => {
    const { semester_label, activate_midterm = true } = req.body || {};
    if (!semester_label || typeof semester_label !== 'string' || semester_label.trim().length === 0)
        return res.status(400).json({ success: false, message: 'semester_label is required.' });

    const label = semester_label.trim();
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Idempotent insert: if either row already exists, leave it untouched.
        const [ins] = await conn.query(
            `INSERT IGNORE INTO exam_periods (semester_label, exam_type, is_active)
             VALUES (?, 'midterm', 0), (?, 'endterm', 0)`,
            [label, label]
        );
        const newlyInserted = ins.affectedRows; // 0 = already existed; 2 = brand new pair

        // Reload both period IDs (newly inserted OR pre-existing)
        const [rows] = await conn.query(
            `SELECT id, semester_label, exam_type FROM exam_periods
             WHERE semester_label = ? ORDER BY FIELD(exam_type, 'midterm','endterm')`,
            [label]
        );
        if (rows.length !== 2) {
            await conn.rollback();
            return res.status(500).json({ success: false, message: 'Failed to create semester pair.' });
        }
        const midtermRow = rows.find(r => r.exam_type === 'midterm');

        // Auto-activate is BOOTSTRAP-ONLY: flip the new midterm to active only
        // when no other period is currently active. Otherwise creating a fresh
        // semester silently hides the data of whatever was active before — that
        // was the source of multiple "all my admin tabs went empty" reports.
        // The admin can still opt-in to switching via the Exam Periods card
        // in Registration after creation.
        if (newlyInserted > 0 && activate_midterm && midtermRow) {
            const [activeRows] = await conn.query(
                'SELECT id FROM exam_periods WHERE is_active = 1 LIMIT 1'
            );
            if (activeRows.length === 0) {
                await conn.query('UPDATE exam_periods SET is_active = 1 WHERE id = ?', [midtermRow.id]);
            }
        }

        // Seed role-target rows (3 roles × 2 periods = 6 rows) — idempotent
        const seedValues = [];
        for (const p of rows) {
            for (const role of VALID_ROLES) seedValues.push([p.id, role, 0]);
        }
        await conn.query(
            `INSERT IGNORE INTO invigilator_role_targets (exam_period_id, role, target_duties) VALUES ?`,
            [seedValues]
        );

        await conn.commit();
        res.status(201).json({
            success: true,
            already_existed: newlyInserted === 0,
            message: newlyInserted === 0
                ? `Semester "${label}" already exists — no changes made.`
                : `Semester "${label}" ready (midterm + endterm).`,
            periods: rows,
        });
    } catch (err) {
        await conn.rollback().catch(() => {});
        console.error('createSemester error:', err);
        res.status(500).json({ success: false, message: err.message || 'Failed to create semester.' });
    } finally {
        conn.release();
    }
};

// GET /periods-overview — every period with its data counts.
//
// Drives the Registration tab's "where is my data?" overview: each row shows
// slot / scheduled-exam / seating-plan / invigilator-assignment counts so the
// admin can pick the right active period at a glance.
//
// Uses correlated subqueries rather than GROUP BY / LEFT JOIN aggregation —
// the counts come from four different fact tables, and grouping all of them
// together would explode row counts. With ~10 periods on the heaviest install
// this stays well under 1 ms.
export const getPeriodsOverview = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                p.id,
                p.semester_label,
                p.exam_type,
                p.is_active,
                p.created_at,
                (SELECT COUNT(*) FROM exam_slots
                  WHERE exam_period_id = p.id) AS slots,
                (SELECT COUNT(*) FROM invigilator_assignments
                  WHERE exam_period_id = p.id) AS invig_assignments,
                (SELECT COUNT(*) FROM scheduled_exams se
                  JOIN exam_slots es ON se.slot_id = es.id
                  WHERE es.exam_period_id = p.id) AS scheduled_exams,
                (SELECT COUNT(*) FROM individual_seating_plans isp
                  JOIN seating_allocations sa ON isp.allocation_id = sa.id
                  JOIN scheduled_exams se     ON sa.scheduled_exam_id = se.id
                  JOIN exam_slots es          ON se.slot_id = es.id
                  WHERE es.exam_period_id = p.id) AS seating_plans
            FROM exam_periods p
            ORDER BY
                /* Primary: numeric start-year extracted from the label
                   ("EVEN 2025-2026" → 2025). REGEXP_SUBSTR returns NULL for
                   labels without a 4-digit year (e.g. the seeded "Current
                   Semester"); CAST(NULL) → NULL, and NULLs sort last on DESC
                   in MySQL, so legacy entries fall to the bottom. */
                CAST(REGEXP_SUBSTR(p.semester_label, '[0-9]{4}') AS UNSIGNED) DESC,
                /* Secondary: normalise label case for stable grouping inside
                   a year — EVEN / ODD / SUMMER TERM end up in alphabetical
                   order, which keeps related rows adjacent. */
                UPPER(p.semester_label) ASC,
                /* Tertiary: midterm above endterm within the same semester */
                FIELD(p.exam_type, 'midterm', 'endterm') ASC
        `);
        // Normalise counts to Number — mysql2 returns COUNT(*) as a BigInt-like
        // string for large values; small ones come back as numbers. Coerce so
        // the frontend doesn't have to guess.
        res.json({
            success: true,
            periods: rows.map(r => ({
                id:                r.id,
                semester_label:    r.semester_label,
                exam_type:         r.exam_type,
                is_active:         !!r.is_active,
                created_at:        r.created_at,
                slots:             Number(r.slots),
                scheduled_exams:   Number(r.scheduled_exams),
                seating_plans:     Number(r.seating_plans),
                invig_assignments: Number(r.invig_assignments),
            })),
        });
    } catch (err) {
        console.error('getPeriodsOverview error:', err);
        res.status(500).json({ success: false, message: 'Failed to load periods overview.' });
    }
};

// PUT /exam-periods/:id/activate — atomic flip
export const activateExamPeriod = async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid id.' });

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [exists] = await conn.query('SELECT id FROM exam_periods WHERE id = ?', [id]);
        if (exists.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Period not found.' });
        }
        await conn.query('UPDATE exam_periods SET is_active = 0');
        await conn.query('UPDATE exam_periods SET is_active = 1 WHERE id = ?', [id]);
        await conn.commit();
        res.json({ success: true, message: 'Period activated.' });
    } catch (err) {
        await conn.rollback().catch(() => {});
        console.error('activateExamPeriod error:', err);
        res.status(500).json({ success: false, message: 'Failed to activate period.' });
    } finally {
        conn.release();
    }
};

// DELETE /exam-periods/:id
//
// Permanently removes a period AND everything period-scoped under it.
// The FK chain is fully ON DELETE CASCADE all the way down (verified against
// information_schema), so a single DELETE on exam_periods propagates to:
//   exam_slots → scheduled_exams → seating_allocations → individual_seating_plans
//   invigilator_assignments → invigilator_swap_requests
//   invigilator_role_targets, invigilator_target_overrides
//
// Past Exams snapshots are NOT affected (they have no FK to live tables).
//
// Two safety guards:
//   1. 409 if the period is currently active — force the admin to switch first.
//   2. Pre-flight row counts are returned so the UI can show a "deleted N rows"
//      receipt after the fact.
export const deleteExamPeriod = async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid id.' });

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Verify it exists and capture its is_active flag.
        const [rows] = await conn.query(
            'SELECT id, semester_label, exam_type, is_active FROM exam_periods WHERE id = ? FOR UPDATE',
            [id]
        );
        if (rows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Period not found.' });
        }
        const period = rows[0];

        if (period.is_active) {
            await conn.rollback();
            return res.status(409).json({
                success: false,
                message: 'Cannot delete the currently-active period. Activate a different period first.',
            });
        }

        // Pre-flight: count what's about to vanish. The UI uses these numbers
        // for the post-delete "deleted N rows" receipt.
        const [[counts]] = await conn.query(`
            SELECT
                (SELECT COUNT(*) FROM exam_slots              WHERE exam_period_id = ?) AS slots,
                (SELECT COUNT(*) FROM invigilator_assignments WHERE exam_period_id = ?) AS invig_assignments,
                (SELECT COUNT(*) FROM scheduled_exams se JOIN exam_slots es ON se.slot_id = es.id
                    WHERE es.exam_period_id = ?) AS scheduled_exams,
                (SELECT COUNT(*) FROM individual_seating_plans isp
                    JOIN seating_allocations sa ON isp.allocation_id = sa.id
                    JOIN scheduled_exams se     ON sa.scheduled_exam_id = se.id
                    JOIN exam_slots es          ON se.slot_id = es.id
                    WHERE es.exam_period_id = ?) AS seating_plans,
                (SELECT COUNT(*) FROM invigilator_swap_requests WHERE exam_period_id = ?) AS swap_requests
        `, [id, id, id, id, id]);

        // Single DELETE — CASCADE handles the rest.
        await conn.query('DELETE FROM exam_periods WHERE id = ?', [id]);

        await conn.commit();
        res.json({
            success: true,
            message: `Period "${period.semester_label} / ${period.exam_type}" deleted.`,
            deleted: {
                slots:             Number(counts.slots),
                scheduled_exams:   Number(counts.scheduled_exams),
                seating_plans:     Number(counts.seating_plans),
                invig_assignments: Number(counts.invig_assignments),
                swap_requests:     Number(counts.swap_requests),
            },
        });
    } catch (err) {
        await conn.rollback().catch(() => {});
        console.error('deleteExamPeriod error:', err);
        res.status(500).json({ success: false, message: err.message || 'Failed to delete period.' });
    } finally {
        conn.release();
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  ROLE TARGETS (per period)
// ═════════════════════════════════════════════════════════════════════════════

// GET /role-targets[?period_id=]
// M2: no lazy-seed — createSemester now seeds the 6 rows upfront.
// If a row is missing (e.g., legacy period) we fall back to 0 in the frontend.
export const getRoleTargets = async (req, res) => {
    try {
        const periodId = await resolveActivePeriod(null, req.query.period_id);
        const [rows] = await db.query(
            `SELECT role, target_duties, updated_at FROM invigilator_role_targets
             WHERE exam_period_id = ?
             ORDER BY FIELD(role, 'faculty','phd_student','lab_staff')`,
            [periodId]
        );
        res.json({ success: true, exam_period_id: periodId, targets: rows });
    } catch (err) {
        const status = err.http || 500;
        console.error('getRoleTargets error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to fetch role targets.' });
    }
};

// PUT /role-targets — body { targets: [{role, target_duties}], period_id? }
export const updateRoleTargets = async (req, res) => {
    const { targets, period_id } = req.body;
    if (!Array.isArray(targets) || targets.length === 0)
        return res.status(400).json({ success: false, message: 'targets array required.' });
    for (const t of targets) {
        if (!VALID_ROLES.includes(t.role))
            return res.status(400).json({ success: false, message: `Invalid role: ${t.role}` });
        if (!Number.isInteger(Number(t.target_duties)) || Number(t.target_duties) < 0)
            return res.status(400).json({ success: false, message: `target_duties must be a non-negative integer for ${t.role}` });
    }
    const conn = await db.getConnection();
    try {
        const periodId = await resolveActivePeriod(conn, period_id);
        await conn.beginTransaction();
        for (const t of targets) {
            await conn.query(
                `INSERT INTO invigilator_role_targets (exam_period_id, role, target_duties) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE target_duties = VALUES(target_duties)`,
                [periodId, t.role, Number(t.target_duties)]
            );
        }
        await conn.commit();
        res.json({ success: true, message: 'Role targets updated.', exam_period_id: periodId });
    } catch (err) {
        await conn.rollback().catch(() => {});
        const status = err.http || 500;
        console.error('updateRoleTargets error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to update role targets.' });
    } finally {
        conn.release();
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  INVIGILATOR LIST — semester-aware (midterm + endterm + cumulative)
// ═════════════════════════════════════════════════════════════════════════════

// GET /invigilators?search=...&period_id=...
export const getInvigilatorList = async (req, res) => {
    const search = req.query.search || '';
    try {
        const activePeriodId = await resolveActivePeriod(null, req.query.period_id);
        const activePeriod = await loadPeriod(null, activePeriodId);

        // Discover the sibling period (other exam_type in the same semester) if it exists.
        const [siblingRows] = await db.query(
            `SELECT id, exam_type FROM exam_periods
             WHERE semester_label = ? AND exam_type != ?`,
            [activePeriod.semester_label, activePeriod.exam_type]
        );
        const siblingId = siblingRows.length > 0 ? siblingRows[0].id : null;

        // For both periods, compute per-user (assigned, role_target, override_target, effective_target).
        // We fetch base lists per period; then merge into a per-user record.

        const params = [];
        let where = "WHERE u.role != 'admin'";
        if (search) {
            where += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR u.employee_id LIKE ? OR u.department LIKE ?)';
            const like = `%${search}%`;
            params.push(like, like, like, like);
        }

        // Active period stats (always present)
        const [activeRows] = await db.query(
            `SELECT
                u.id AS user_id, u.full_name, u.email, u.role, u.department, u.employee_id,
                rt.target_duties      AS role_target,
                ov.override_target,
                ov.note,
                COALESCE(ov.override_target, rt.target_duties, 0) AS effective_target,
                (SELECT COUNT(*) FROM invigilator_assignments ia
                 WHERE ia.user_id = u.id AND ia.exam_period_id = ?) AS assigned_count
             FROM users u
             LEFT JOIN invigilator_role_targets     rt ON rt.role = u.role AND rt.exam_period_id = ?
             LEFT JOIN invigilator_target_overrides ov ON ov.user_id = u.id AND ov.exam_period_id = ?
             ${where}
             ORDER BY u.full_name ASC`,
            [activePeriodId, activePeriodId, activePeriodId, ...params]
        );

        // Sibling period stats (only if it exists)
        let siblingMap = {};
        if (siblingId) {
            const [siblingData] = await db.query(
                `SELECT
                    u.id AS user_id,
                    rt.target_duties      AS role_target,
                    ov.override_target,
                    COALESCE(ov.override_target, rt.target_duties, 0) AS effective_target,
                    (SELECT COUNT(*) FROM invigilator_assignments ia
                     WHERE ia.user_id = u.id AND ia.exam_period_id = ?) AS assigned_count
                 FROM users u
                 LEFT JOIN invigilator_role_targets     rt ON rt.role = u.role AND rt.exam_period_id = ?
                 LEFT JOIN invigilator_target_overrides ov ON ov.user_id = u.id AND ov.exam_period_id = ?
                 WHERE u.role != 'admin'`,
                [siblingId, siblingId, siblingId]
            );
            siblingMap = Object.fromEntries(siblingData.map(r => [r.user_id, r]));
        }

        const enriched = activeRows.map(r => {
            const sib = siblingMap[r.user_id];
            const activeAssigned  = Number(r.assigned_count);
            const activeTarget    = Number(r.effective_target);
            const siblingAssigned = sib ? Number(sib.assigned_count) : 0;
            const siblingTarget   = sib ? Number(sib.effective_target) : 0;
            const cumAssigned = activeAssigned + siblingAssigned;
            const cumTarget   = activeTarget   + siblingTarget;
            const balance     = cumAssigned - cumTarget;
            return {
                user_id:          r.user_id,
                full_name:        r.full_name,
                email:            r.email,
                role:             r.role,
                department:       r.department,
                employee_id:      r.employee_id,
                // active period
                role_target:      r.role_target,
                override_target:  r.override_target,
                note:             r.note,
                effective_target: activeTarget,
                assigned_count:   activeAssigned,
                active_balance:   activeAssigned - activeTarget,
                // sibling period (for semester roll-up)
                sibling_exam_type: sib ? siblingRows[0].exam_type : null,
                sibling_assigned:  siblingAssigned,
                sibling_target:    siblingTarget,
                // cumulative
                cumulative_assigned: cumAssigned,
                cumulative_target:   cumTarget,
                balance,                     // cumulative
                is_configured:       cumTarget > 0,  // S4: distinguish "not set" from "on target"
            };
        });

        res.json({
            success: true,
            active_period: activePeriod,
            sibling_period: siblingId ? { id: siblingId, exam_type: siblingRows[0].exam_type } : null,
            invigilators: enriched,
        });
    } catch (err) {
        const status = err.http || 500;
        console.error('getInvigilatorList error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to fetch invigilators.' });
    }
};

// PUT /invigilators/:user_id/override — body { override_target, note?, period_id? }
export const updateOverride = async (req, res) => {
    const userId = Number(req.params.user_id);
    const { override_target, note, period_id } = req.body;
    if (!Number.isInteger(userId) || userId <= 0)
        return res.status(400).json({ success: false, message: 'Invalid user_id.' });
    try {
        const periodId = await resolveActivePeriod(null, period_id);
        const [exists] = await db.query("SELECT role FROM users WHERE id = ? AND role != 'admin'", [userId]);
        if (exists.length === 0)
            return res.status(404).json({ success: false, message: 'Invigilator not found.' });

        if (override_target === null || override_target === undefined || override_target === '') {
            await db.query(
                'DELETE FROM invigilator_target_overrides WHERE user_id = ? AND exam_period_id = ?',
                [userId, periodId]
            );
            return res.json({ success: true, message: 'Override removed.' });
        }
        const t = Number(override_target);
        if (!Number.isInteger(t) || t < 0)
            return res.status(400).json({ success: false, message: 'override_target must be a non-negative integer.' });

        await db.query(
            `INSERT INTO invigilator_target_overrides (exam_period_id, user_id, override_target, note) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE override_target = VALUES(override_target), note = VALUES(note)`,
            [periodId, userId, t, note || null]
        );
        res.json({ success: true, message: 'Override saved.' });
    } catch (err) {
        const status = err.http || 500;
        console.error('updateOverride error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to update override.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  Shared helper — runs the algorithm and returns proposals WITHOUT writing.
//  Used by both `previewSchedule` (in-memory only) and the legacy
//  `generateSchedule` (which then commits).
// ═════════════════════════════════════════════════════════════════════════════
async function _computeScheduleProposal(conn, periodId) {
    const period = await loadPeriod(conn, periodId);

    const [slots] = await conn.query(`
        SELECT DISTINCT es.id AS slot_id, es.exam_date, es.start_time
        FROM exam_slots es
        JOIN scheduled_exams se ON se.slot_id = es.id
        JOIN seating_allocations sa ON sa.scheduled_exam_id = se.id
        WHERE es.exam_period_id = ?
        ORDER BY es.exam_date, es.start_time
    `, [periodId]);
    if (slots.length === 0)
        throw Object.assign(new Error('No slots have seating allocations yet. Run Seating Manager first.'), { http: 400 });

    const [loadRows] = await conn.query(`
        SELECT se.slot_id, sa.classroom_id, c.location_order,
               SUM(sa.student_count) AS students_in_room
        FROM seating_allocations sa
        JOIN scheduled_exams se ON sa.scheduled_exam_id = se.id
        JOIN exam_slots es      ON se.slot_id = es.id
        JOIN classrooms c       ON sa.classroom_id = c.id
        WHERE es.exam_period_id = ?
        GROUP BY se.slot_id, sa.classroom_id, c.location_order
    `, [periodId]);
    const roomLoadBySlot = {};
    for (const r of loadRows) {
        if (!roomLoadBySlot[r.slot_id]) roomLoadBySlot[r.slot_id] = [];
        roomLoadBySlot[r.slot_id].push({
            classroom_id:     r.classroom_id,
            location_order:   r.location_order,
            students_in_room: Number(r.students_in_room),
        });
    }

    const [ciRows] = await conn.query(`
        SELECT se.slot_id, se.course_code,
               GROUP_CONCAT(DISTINCT sa.classroom_id) AS classroom_ids,
               GROUP_CONCAT(DISTINCT u.id)            AS instructor_user_ids
        FROM scheduled_exams se
        JOIN seating_allocations sa ON sa.scheduled_exam_id = se.id
        JOIN exam_slots es          ON se.slot_id = es.id
        LEFT JOIN course_instructors ci
            ON ci.course_code = se.course_code AND ci.semester_label = ?
        LEFT JOIN users u ON u.employee_id = ci.employee_id AND u.role != 'admin'
        WHERE es.exam_period_id = ?
        GROUP BY se.slot_id, se.course_code
    `, [period.semester_label, periodId]);
    const courseInstructorsBySlot = {};
    for (const r of ciRows) {
        if (!r.instructor_user_ids) continue;
        if (!courseInstructorsBySlot[r.slot_id]) courseInstructorsBySlot[r.slot_id] = [];
        courseInstructorsBySlot[r.slot_id].push({
            course_code:         r.course_code,
            classroom_ids:       String(r.classroom_ids).split(',').map(Number).filter(Boolean),
            instructor_user_ids: String(r.instructor_user_ids).split(',').map(Number).filter(Boolean),
        });
    }

    const [siblingRows] = await conn.query(
        `SELECT id FROM exam_periods WHERE semester_label = ? AND exam_type != ?`,
        [period.semester_label, period.exam_type]
    );
    const siblingId = siblingRows.length > 0 ? siblingRows[0].id : null;

    const [invRows] = await conn.query(
        `SELECT
            u.id AS user_id, u.role,
            COALESCE(ov.override_target, rt.target_duties, 0)  AS base_target,
            ${siblingId ? `(
                (SELECT COUNT(*) FROM invigilator_assignments ia WHERE ia.user_id = u.id AND ia.exam_period_id = ?)
                -
                COALESCE(
                    (SELECT ov2.override_target FROM invigilator_target_overrides ov2
                        WHERE ov2.user_id = u.id AND ov2.exam_period_id = ?),
                    (SELECT rt2.target_duties FROM invigilator_role_targets rt2
                        WHERE rt2.role = u.role AND rt2.exam_period_id = ?),
                    0
                )
            )` : '0'} AS previous_balance
         FROM users u
         LEFT JOIN invigilator_role_targets     rt ON rt.role = u.role AND rt.exam_period_id = ?
         LEFT JOIN invigilator_target_overrides ov ON ov.user_id = u.id AND ov.exam_period_id = ?
         WHERE u.role != 'admin'`,
        siblingId
            ? [siblingId, siblingId, siblingId, periodId, periodId]
            : [periodId, periodId]
    );
    const invigilators = invRows.map(r => ({
        user_id:          r.user_id,
        role:             r.role,
        base_target:      Number(r.base_target),
        previous_balance: Number(r.previous_balance),
        // Symmetric semester-wide carryover (S1).
        effective_target: Math.max(0, Number(r.base_target) - Number(r.previous_balance)),
    }));

    if (invigilators.length === 0)
        throw Object.assign(new Error('No invigilators registered.'), { http: 400 });

    const { assignments, summary, warnings } = runInvigilatorAlgorithm(
        slots, roomLoadBySlot, courseInstructorsBySlot, invigilators
    );

    return { period, slots, assignments, summary, warnings };
}

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/invigilator-scheduling/generate-preview
//  Runs the algorithm in-memory and returns proposals WITHOUT writing to DB.
//  The frontend stages these as pending edits; clicking Save commits via the
//  existing applyChanges endpoint.
// ═════════════════════════════════════════════════════════════════════════════
export const previewSchedule = async (req, res) => {
    const conn = await db.getConnection();
    try {
        const periodId = await resolveActivePeriod(conn, req.body?.period_id);
        const { period, slots, assignments, summary, warnings } = await _computeScheduleProposal(conn, periodId);

        // Enrich each proposal with user metadata so chips can render names/roles
        // without a second frontend fetch.
        const userIds = Array.from(new Set(assignments.map(a => a.user_id)));
        let userMap = new Map();
        if (userIds.length > 0) {
            const ph = userIds.map(() => '?').join(',');
            const [users] = await conn.query(
                `SELECT id, full_name, role, employee_id FROM users WHERE id IN (${ph})`,
                userIds
            );
            userMap = new Map(users.map(u => [u.id, u]));
        }
        const enriched = assignments.map(a => ({
            ...a,
            // is_course_instructor is already on `a` from the algorithm — keep it
            full_name:   userMap.get(a.user_id)?.full_name   || `User #${a.user_id}`,
            role:        userMap.get(a.user_id)?.role        || null,
            employee_id: userMap.get(a.user_id)?.employee_id || null,
        }));

        res.json({
            success: true,
            exam_period: period,
            slots_count: slots.length,
            assignments: enriched,
            summary,
            warnings,
            message: `Previewed ${enriched.length} assignments for ${period.semester_label} — ${period.exam_type}. Nothing saved yet.`,
        });
    } catch (err) {
        const status = err.http || 500;
        console.error('previewSchedule error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to preview schedule.' });
    } finally {
        conn.release();
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  DEPRECATED — POST /api/invigilator-scheduling/generate
//  Legacy "generate AND save" path. Kept so any external callers don't break.
//  New UI uses /generate-preview + applyChanges instead.
// ═════════════════════════════════════════════════════════════════════════════
export const generateSchedule = async (req, res) => {
    const conn = await db.getConnection();
    try {
        const periodId = await resolveActivePeriod(conn, req.body?.period_id);
        const { period, slots, assignments, summary, warnings } = await _computeScheduleProposal(conn, periodId);

        await conn.beginTransaction();
        const [del] = await conn.query('DELETE FROM invigilator_assignments WHERE exam_period_id = ?', [periodId]);
        let inserted = 0;
        if (assignments.length > 0) {
            const values = assignments.map(a => [
                a.slot_id, a.classroom_id, a.user_id, a.is_course_instructor, periodId,
            ]);
            const [ins] = await conn.query(
                `INSERT INTO invigilator_assignments
                    (slot_id, classroom_id, user_id, is_course_instructor, exam_period_id)
                 VALUES ?`,
                [values]
            );
            inserted = ins.affectedRows;
        }
        await conn.commit();

        res.json({
            success: true,
            message: `Generated ${inserted} assignments for ${period.semester_label} — ${period.exam_type} across ${slots.length} slot(s). Cleared ${del.affectedRows} previous.`,
            exam_period: period,
            cleared:  del.affectedRows,
            inserted,
            warnings,
            summary,
        });
    } catch (err) {
        await conn.rollback().catch(() => {});
        const status = err.http || 500;
        console.error('generateSchedule error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to generate schedule.' });
    } finally {
        conn.release();
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  READ SCHEDULE
// ═════════════════════════════════════════════════════════════════════════════
export const getSchedule = async (req, res) => {
    const { slot_id } = req.query;
    try {
        const periodId = await resolveActivePeriod(null, req.query.period_id);
        const period = await loadPeriod(null, periodId);

        // Always scope slots by the active period. Without this filter the
        // endpoint returned slots from EVERY period, so when the active period
        // had no slots the UI rendered another period's slots underneath the
        // active period's header — appearing to show data that wasn't really
        // there. Optional `?slot_id=` narrows further (still inside the period).
        const slotParams = [periodId];
        let slotWhere = 'WHERE es.exam_period_id = ?';
        if (slot_id) { slotWhere += ' AND es.id = ?'; slotParams.push(Number(slot_id)); }

        const [slots] = await db.query(
            `SELECT es.id AS slot_id, es.exam_date, es.exam_day, es.start_time, es.end_time
             FROM exam_slots es
             ${slotWhere}
             ORDER BY es.exam_date, es.start_time`,
            slotParams
        );
        if (slots.length === 0) return res.json({ success: true, exam_period: period, schedule: [] });

        const slotIds = slots.map(s => s.slot_id);
        const ph = slotIds.map(() => '?').join(',');

        const [roomRows] = await db.query(
            `SELECT se.slot_id, sa.classroom_id, c.room_name, c.location_order,
                    SUM(sa.student_count) AS students_in_room,
                    GROUP_CONCAT(DISTINCT co.course_code SEPARATOR ', ') AS course_codes
             FROM seating_allocations sa
             JOIN scheduled_exams se ON sa.scheduled_exam_id = se.id
             JOIN classrooms c       ON sa.classroom_id = c.id
             JOIN exam_slots es      ON se.slot_id = es.id
             JOIN exam_periods ep    ON ep.id = es.exam_period_id
             JOIN courses co         ON se.course_code = co.course_code AND co.semester_label = ep.semester_label
             WHERE se.slot_id IN (${ph})
             GROUP BY se.slot_id, sa.classroom_id, c.room_name, c.location_order
             ORDER BY se.slot_id, c.location_order`,
            slotIds
        );

        const [assignRows] = await db.query(
            `SELECT ia.id AS assignment_id, ia.slot_id, ia.classroom_id, ia.user_id,
                    ia.is_course_instructor, u.full_name, u.role, u.employee_id
             FROM invigilator_assignments ia
             JOIN users u ON ia.user_id = u.id
             WHERE ia.slot_id IN (${ph}) AND ia.exam_period_id = ?
             ORDER BY ia.slot_id, ia.classroom_id, u.full_name`,
            [...slotIds, periodId]
        );

        const slotMap = new Map();
        for (const s of slots) slotMap.set(s.slot_id, { ...s, rooms: [] });
        const roomKey = (sid, cid) => `${sid}|${cid}`;
        const roomMap = new Map();
        for (const r of roomRows) {
            const k = roomKey(r.slot_id, r.classroom_id);
            const students = Number(r.students_in_room);
            const required = Math.max(1, Math.ceil(students / 25));
            const entry = {
                classroom_id:   r.classroom_id,
                room_name:      r.room_name,
                location_order: r.location_order,
                students,
                required,
                course_codes:   r.course_codes,
                invigilators:   [],
            };
            roomMap.set(k, entry);
            slotMap.get(r.slot_id).rooms.push(entry);
        }
        for (const a of assignRows) {
            const k = roomKey(a.slot_id, a.classroom_id);
            const room = roomMap.get(k);
            if (!room) continue;
            room.invigilators.push({
                assignment_id:        a.assignment_id,
                user_id:              a.user_id,
                full_name:            a.full_name,
                role:                 a.role,
                employee_id:          a.employee_id,
                is_course_instructor: !!a.is_course_instructor,
            });
        }
        res.json({ success: true, exam_period: period, schedule: Array.from(slotMap.values()) });
    } catch (err) {
        const status = err.http || 500;
        console.error('getSchedule error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to fetch schedule.' });
    }
};

// DELETE /schedule — wipes active period only
export const clearSchedule = async (req, res) => {
    try {
        const periodId = await resolveActivePeriod(null, req.query.period_id);
        const [result] = await db.query('DELETE FROM invigilator_assignments WHERE exam_period_id = ?', [periodId]);
        res.json({
            success: true,
            message: `Cleared ${result.affectedRows} assignment(s) for the active period.`,
            cleared: result.affectedRows,
        });
    } catch (err) {
        const status = err.http || 500;
        console.error('clearSchedule error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to clear schedule.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  APPLY BATCHED CHANGES — period-scoped
// ═════════════════════════════════════════════════════════════════════════════
export const applyChanges = async (req, res) => {
    const { reassigns = [], removes = [], adds = [], period_id } = req.body || {};
    if (!Array.isArray(reassigns) || !Array.isArray(removes) || !Array.isArray(adds))
        return res.status(400).json({ success: false, message: 'reassigns, removes, adds must be arrays.' });
    if (reassigns.length === 0 && removes.length === 0 && adds.length === 0)
        return res.json({ success: true, message: 'No changes to apply.', applied: { reassigns: 0, removes: 0, adds: 0 } });

    const conn = await db.getConnection();
    try {
        const periodId = await resolveActivePeriod(conn, period_id);
        await conn.beginTransaction();

        let removedCount = 0, reassignedCount = 0, addedCount = 0;

        for (const id of removes) {
            const numId = Number(id);
            if (!numId) continue;
            const [r] = await conn.query(
                'DELETE FROM invigilator_assignments WHERE id = ? AND exam_period_id = ?',
                [numId, periodId]
            );
            removedCount += r.affectedRows;
        }

        for (const r of reassigns) {
            const numId = Number(r.assignment_id);
            const newUid = Number(r.user_id);
            if (!numId || !newUid) continue;
            const [exists] = await conn.query(
                'SELECT slot_id, user_id FROM invigilator_assignments WHERE id = ? AND exam_period_id = ?',
                [numId, periodId]
            );
            if (exists.length === 0)
                throw Object.assign(new Error(`Reassign target ${numId} not found in active period.`), { http: 404 });
            if (Number(exists[0].user_id) === newUid) continue;
            const [busy] = await conn.query(
                'SELECT id FROM invigilator_assignments WHERE slot_id = ? AND user_id = ? AND exam_period_id = ? AND id != ?',
                [exists[0].slot_id, newUid, periodId, numId]
            );
            if (busy.length > 0)
                throw Object.assign(new Error(`Conflict: user ${newUid} is already in another room of slot ${exists[0].slot_id}.`), { http: 409 });
            const [users] = await conn.query("SELECT id FROM users WHERE id = ? AND role != 'admin'", [newUid]);
            if (users.length === 0)
                throw Object.assign(new Error(`User ${newUid} not found or is admin.`), { http: 404 });

            // Look up the row's classroom so we can preserve the instructor flag
            const [rowMeta] = await conn.query(
                'SELECT classroom_id FROM invigilator_assignments WHERE id = ?', [numId]
            );
            const isInstr = rowMeta.length > 0
                ? await isInstructorForRoom(conn, newUid, exists[0].slot_id, rowMeta[0].classroom_id)
                : false;

            const [u] = await conn.query(
                'UPDATE invigilator_assignments SET user_id = ?, is_course_instructor = ? WHERE id = ?',
                [newUid, isInstr ? 1 : 0, numId]
            );
            reassignedCount += u.affectedRows;
        }

        for (const a of adds) {
            const slotId = Number(a.slot_id);
            const classroomId = Number(a.classroom_id);
            const userId = Number(a.user_id);
            if (!slotId || !classroomId || !userId) continue;
            const [busy] = await conn.query(
                'SELECT id FROM invigilator_assignments WHERE slot_id = ? AND user_id = ? AND exam_period_id = ?',
                [slotId, userId, periodId]
            );
            if (busy.length > 0)
                throw Object.assign(new Error(`Conflict: user ${userId} is already in slot ${slotId}.`), { http: 409 });
            const [users] = await conn.query("SELECT id FROM users WHERE id = ? AND role != 'admin'", [userId]);
            if (users.length === 0)
                throw Object.assign(new Error(`User ${userId} not found or is admin.`), { http: 404 });
            const isInstr = await isInstructorForRoom(conn, userId, slotId, classroomId);
            const [r] = await conn.query(
                `INSERT INTO invigilator_assignments
                    (slot_id, classroom_id, user_id, is_course_instructor, exam_period_id)
                 VALUES (?, ?, ?, ?, ?)`,
                [slotId, classroomId, userId, isInstr ? 1 : 0, periodId]
            );
            if (r.affectedRows === 1) addedCount++;
        }

        await conn.commit();
        res.json({
            success: true,
            message: `Saved: ${removedCount} removed, ${reassignedCount} reassigned, ${addedCount} added.`,
            applied: { removes: removedCount, reassigns: reassignedCount, adds: addedCount },
        });
    } catch (err) {
        await conn.rollback().catch(() => {});
        const status = err.http || 500;
        console.error('applyChanges error:', err.message);
        res.status(status).json({ success: false, message: err.message || 'Failed to apply changes.' });
    } finally {
        conn.release();
    }
};

// PUT /assignments/:id/reassign
export const reassignAssignment = async (req, res) => {
    const id = Number(req.params.id);
    const { user_id } = req.body;
    if (!id || !user_id)
        return res.status(400).json({ success: false, message: 'Assignment id and user_id are required.' });
    try {
        const [rows] = await db.query(
            'SELECT slot_id, classroom_id, user_id, exam_period_id FROM invigilator_assignments WHERE id = ?',
            [id]
        );
        if (rows.length === 0)
            return res.status(404).json({ success: false, message: 'Assignment not found.' });
        const current = rows[0];
        if (Number(current.user_id) === Number(user_id))
            return res.json({ success: true, message: 'No change — same invigilator.' });
        const [users] = await db.query("SELECT id FROM users WHERE id = ? AND role != 'admin'", [Number(user_id)]);
        if (users.length === 0)
            return res.status(404).json({ success: false, message: 'Invigilator not found or is admin.' });
        const [busy] = await db.query(
            'SELECT id FROM invigilator_assignments WHERE slot_id = ? AND user_id = ? AND exam_period_id = ? AND id != ?',
            [current.slot_id, Number(user_id), current.exam_period_id, id]
        );
        if (busy.length > 0)
            return res.status(409).json({ success: false, message: 'This invigilator is already assigned to another room in this slot.' });
        const isInstr = await isInstructorForRoom(null, Number(user_id), current.slot_id, current.classroom_id);
        await db.query(
            'UPDATE invigilator_assignments SET user_id = ?, is_course_instructor = ? WHERE id = ?',
            [Number(user_id), isInstr ? 1 : 0, id]
        );
        res.json({ success: true, message: 'Reassigned.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(409).json({ success: false, message: 'Duplicate assignment.' });
        console.error('reassignAssignment error:', err);
        res.status(500).json({ success: false, message: 'Failed to reassign.' });
    }
};

// DELETE /assignments/:id
export const removeAssignment = async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid id.' });
    try {
        const [result] = await db.query('DELETE FROM invigilator_assignments WHERE id = ?', [id]);
        if (result.affectedRows === 0)
            return res.status(404).json({ success: false, message: 'Assignment not found.' });
        res.json({ success: true, message: 'Assignment removed.' });
    } catch (err) {
        console.error('removeAssignment error:', err);
        res.status(500).json({ success: false, message: 'Failed to remove assignment.' });
    }
};

// POST /assignments
export const addAssignment = async (req, res) => {
    const { slot_id, classroom_id, user_id, period_id } = req.body;
    if (!slot_id || !classroom_id || !user_id)
        return res.status(400).json({ success: false, message: 'slot_id, classroom_id, user_id are required.' });
    try {
        const periodId = await resolveActivePeriod(null, period_id);
        const [busy] = await db.query(
            'SELECT id FROM invigilator_assignments WHERE slot_id = ? AND user_id = ? AND exam_period_id = ?',
            [slot_id, user_id, periodId]
        );
        if (busy.length > 0)
            return res.status(409).json({ success: false, message: 'This invigilator is already assigned to another room in this slot.' });
        // Auto-detect: is this user a course-instructor for any course in this room?
        const isInstr = await isInstructorForRoom(null, Number(user_id), Number(slot_id), Number(classroom_id));
        const [result] = await db.query(
            `INSERT INTO invigilator_assignments (slot_id, classroom_id, user_id, is_course_instructor, exam_period_id)
             VALUES (?, ?, ?, ?, ?)`,
            [Number(slot_id), Number(classroom_id), Number(user_id), isInstr ? 1 : 0, periodId]
        );
        res.status(201).json({ success: true, id: result.insertId, message: 'Assignment added.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(409).json({ success: false, message: 'Duplicate assignment.' });
        const status = err.http || 500;
        console.error('addAssignment error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to add assignment.' });
    }
};

// GET /eligible?slot_id=&exclude_assignment_id=&period_id=
export const getEligibleForSlot = async (req, res) => {
    const slotId = Number(req.query.slot_id);
    const excludeAssignmentId = req.query.exclude_assignment_id ? Number(req.query.exclude_assignment_id) : null;
    if (!slotId) return res.status(400).json({ success: false, message: 'slot_id is required.' });

    try {
        const periodId = await resolveActivePeriod(null, req.query.period_id);

        // Busy = already in this slot WITHIN the active exam period (other periods are irrelevant).
        let busyClause = 'SELECT user_id FROM invigilator_assignments WHERE slot_id = ? AND exam_period_id = ?';
        const busyParams = [slotId, periodId];
        if (excludeAssignmentId) {
            busyClause += ' AND id != ?';
            busyParams.push(excludeAssignmentId);
        }
        // Placeholder order in the SQL below: the three enrichment `?` (assigned_count
        // subquery + the two LEFT JOINs) come FIRST, then the busy subquery's `?`s.
        const params = [periodId, periodId, periodId, ...busyParams];

        const [rows] = await db.query(
            `SELECT u.id AS user_id, u.full_name, u.role, u.employee_id, u.department,
                    COALESCE(ov.override_target, rt.target_duties, 0) AS effective_target,
                    (SELECT COUNT(*) FROM invigilator_assignments ia2 WHERE ia2.user_id = u.id AND ia2.exam_period_id = ?) AS assigned_count
             FROM users u
             LEFT JOIN invigilator_role_targets     rt ON rt.role = u.role AND rt.exam_period_id = ?
             LEFT JOIN invigilator_target_overrides ov ON ov.user_id = u.id AND ov.exam_period_id = ?
             WHERE u.role != 'admin'
               AND u.id NOT IN (${busyClause})
             ORDER BY u.full_name ASC`,
            params
        );

        const enriched = rows.map(r => ({
            ...r,
            effective_target: Number(r.effective_target),
            assigned_count:   Number(r.assigned_count),
            balance:          Number(r.assigned_count) - Number(r.effective_target),
        }));
        res.json({ success: true, eligible: enriched });
    } catch (err) {
        const status = err.http || 500;
        console.error('getEligibleForSlot error:', err);
        res.status(status).json({ success: false, message: err.message || 'Failed to fetch eligible invigilators.' });
    }
};
