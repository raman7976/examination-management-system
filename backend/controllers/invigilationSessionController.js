import db from '../config/mysql.js';
import { resolveActivePeriod, loadPeriod } from '../utils/periodResolver.js';

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/invigilator-scheduling/sessions/save
//  Snapshots the current invigilation assignments for the active period into
//  invigilation_sessions + invigilation_session_duties (fully denormalised).
// ═════════════════════════════════════════════════════════════════════════════
export const saveInvigilationSession = async (req, res) => {
    const { session_name } = req.body;
    if (!session_name || !session_name.trim()) {
        return res.status(400).json({ success: false, message: 'session_name is required.' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const periodId = await resolveActivePeriod(conn, req.body.period_id);
        const period = await loadPeriod(conn, periodId);

        const [assignments] = await conn.query(
            `SELECT ia.id, ia.slot_id, ia.classroom_id, ia.user_id,
                    ia.is_course_instructor,
                    es.exam_date, es.exam_day, es.start_time, es.end_time,
                    cl.room_name,
                    u.full_name, u.employee_id, u.role
             FROM invigilator_assignments ia
             JOIN exam_slots es  ON ia.slot_id      = es.id
             JOIN classrooms cl  ON ia.classroom_id  = cl.id
             JOIN users u        ON ia.user_id       = u.id
             WHERE ia.exam_period_id = ?
             ORDER BY es.exam_date, es.start_time, cl.location_order, u.full_name`,
            [periodId]
        );

        if (assignments.length === 0) {
            await conn.rollback();
            return res.status(404).json({
                success: false,
                message: 'No invigilation assignments found for the active period. Generate a schedule first.',
            });
        }

        const slotIds = [...new Set(assignments.map(a => a.slot_id))];
        let courseMap = new Map();
        if (slotIds.length > 0) {
            const ph = slotIds.map(() => '?').join(',');
            const [courseRows] = await conn.query(
                `SELECT se.slot_id, sa.classroom_id,
                        GROUP_CONCAT(DISTINCT se.course_code SEPARATOR ', ') AS course_codes
                 FROM seating_allocations sa
                 JOIN scheduled_exams se ON sa.scheduled_exam_id = se.id
                 WHERE se.slot_id IN (${ph})
                 GROUP BY se.slot_id, sa.classroom_id`,
                slotIds
            );
            for (const r of courseRows) {
                courseMap.set(`${r.slot_id}|${r.classroom_id}`, r.course_codes);
            }
        }

        const uniqueUsers = new Set(assignments.map(a => a.user_id));

        const [sessionResult] = await conn.execute(
            `INSERT INTO invigilation_sessions
                (exam_period_id, session_name, semester_label, exam_type, total_assignments, total_invigilators)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [periodId, session_name.trim(), period.semester_label, period.exam_type,
             assignments.length, uniqueUsers.size]
        );
        const sessionId = sessionResult.insertId;

        const values = assignments.map(a => [
            sessionId,
            a.slot_id, a.exam_date, a.exam_day, a.start_time, a.end_time,
            a.classroom_id, a.room_name,
            a.user_id, a.full_name, a.employee_id, a.role,
            a.is_course_instructor ? 1 : 0,
            courseMap.get(`${a.slot_id}|${a.classroom_id}`) || null,
        ]);

        await conn.query(
            `INSERT INTO invigilation_session_duties
                (session_id, slot_id, exam_date, exam_day, start_time, end_time,
                 classroom_id, room_name, user_id, full_name, employee_id, role,
                 is_course_instructor, course_codes)
             VALUES ?`,
            [values]
        );

        await conn.commit();

        res.status(201).json({
            success: true,
            message: `Invigilation session saved — ${assignments.length} duty records archived.`,
            session_id: sessionId,
        });
    } catch (error) {
        await conn.rollback();
        console.error('saveInvigilationSession error:', error);
        res.status(500).json({ success: false, message: 'Failed to save invigilation session.', error: error.message });
    } finally {
        conn.release();
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/invigilator-scheduling/sessions
// ═════════════════════════════════════════════════════════════════════════════
export const getAllInvigilationSessions = async (_req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM invigilation_sessions ORDER BY saved_at DESC'
        );
        res.json({ success: true, sessions: rows });
    } catch (error) {
        console.error('getAllInvigilationSessions error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/invigilator-scheduling/sessions/:id
//  Returns full duty data. If the caller is an invigilator (not admin), only
//  their own rows are returned.
// ═════════════════════════════════════════════════════════════════════════════
export const getInvigilationSessionById = async (req, res) => {
    const { id } = req.params;
    try {
        const [meta] = await db.execute(
            'SELECT * FROM invigilation_sessions WHERE id = ?', [id]
        );
        if (meta.length === 0) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        let query = `SELECT * FROM invigilation_session_duties WHERE session_id = ?`;
        const params = [id];

        if (req.user.role !== 'admin') {
            query += ' AND user_id = ?';
            params.push(req.user.id);
        }

        query += ' ORDER BY exam_date, start_time, room_name, full_name';

        const [duties] = await db.execute(query, params);
        res.json({ success: true, session: meta[0], duties });
    } catch (error) {
        console.error('getInvigilationSessionById error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  DELETE /api/invigilator-scheduling/sessions/:id  (admin only)
// ═════════════════════════════════════════════════════════════════════════════
export const deleteInvigilationSession = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.execute(
            'DELETE FROM invigilation_sessions WHERE id = ?', [id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }
        res.json({ success: true, message: 'Invigilation session deleted.' });
    } catch (error) {
        console.error('deleteInvigilationSession error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
