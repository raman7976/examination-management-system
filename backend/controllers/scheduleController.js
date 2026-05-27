import db from '../config/mysql.js';
import { resolveActivePeriod, getActiveSemesterLabel } from '../utils/periodResolver.js';

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/schedule/slots — active period only
// ═════════════════════════════════════════════════════════════════════════════
export const getSlots = async (req, res) => {
    try {
        const periodId = await resolveActivePeriod(null, req.query.period_id);
        const [rows] = await db.execute(
            `SELECT id, exam_date, exam_day, start_time, end_time
             FROM exam_slots
             WHERE exam_period_id = ?
             ORDER BY exam_date, start_time`,
            [periodId]
        );
        res.status(200).json({ success: true, slots: rows, exam_period_id: periodId });
    } catch (error) {
        const status = error.http || 500;
        console.error('getSlots error:', error);
        res.status(status).json({ success: false, message: error.message || 'Failed to fetch exam slots.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/schedule/unscheduled-courses — period-scoped via slot membership
//  A course is "unscheduled" if it's not in scheduled_exams for the active period.
// ═════════════════════════════════════════════════════════════════════════════
export const getUnscheduledCourses = async (req, res) => {
    try {
        const periodId = await resolveActivePeriod(null, req.query.period_id);
        const semester = await getActiveSemesterLabel(null, req.query.period_id);
        const [rows] = await db.execute(
            `SELECT c.course_code, c.course_name, c.total_students, c.short_name,
                    GROUP_CONCAT(COALESCE(u.full_name, ci.instructor_name) SEPARATOR ', ') AS instructors
             FROM courses c
             LEFT JOIN course_instructors ci
                ON c.course_code = ci.course_code AND ci.semester_label = c.semester_label
             LEFT JOIN users u ON ci.employee_id = u.employee_id
             WHERE c.semester_label = ?
               AND c.course_code NOT IN (
                 SELECT se.course_code FROM scheduled_exams se
                 JOIN exam_slots es ON es.id = se.slot_id
                 WHERE es.exam_period_id = ?
             )
             GROUP BY c.course_code, c.course_name, c.total_students, c.short_name
             ORDER BY c.course_code`,
            [semester, periodId]
        );
        res.status(200).json({ success: true, courses: rows });
    } catch (error) {
        const status = error.http || 500;
        console.error('getUnscheduledCourses error:', error);
        res.status(status).json({ success: false, message: error.message || 'Failed to fetch unscheduled courses.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/schedule/assign — slot must belong to active period
// ═════════════════════════════════════════════════════════════════════════════
export const assignCourses = async (req, res) => {
    const { slot_id, course_codes } = req.body;
    if (!slot_id || !Array.isArray(course_codes) || course_codes.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Invalid request. Provide slot_id (number) and course_codes (non-empty array).',
        });
    }

    const conn = await db.getConnection();
    try {
        const periodId = await resolveActivePeriod(conn, req.body.period_id);

        // Slot must belong to active period
        const [slotCheck] = await conn.query(
            'SELECT id FROM exam_slots WHERE id = ? AND exam_period_id = ?',
            [slot_id, periodId]
        );
        if (slotCheck.length === 0) {
            return res.status(400).json({ success: false, message: 'Slot does not belong to the active exam period.' });
        }

        await conn.beginTransaction();
        let assigned = 0;
        for (const code of course_codes) {
            await conn.execute(
                `INSERT INTO scheduled_exams (slot_id, course_code) VALUES (?, ?)`,
                [slot_id, code]
            );
            assigned++;
        }
        await conn.commit();

        res.status(200).json({
            success: true,
            message: `✅ Successfully scheduled ${assigned} course(s) to slot ${slot_id}.`,
            courses_assigned: assigned,
        });
    } catch (dbErr) {
        await conn.rollback().catch(() => {});
        if (dbErr.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'One or more courses are already scheduled. Please refresh and try again.',
            });
        }
        const status = dbErr.http || 500;
        console.error('assignCourses error:', dbErr);
        res.status(status).json({ success: false, message: dbErr.message || 'Failed to assign courses to slot.' });
    } finally {
        conn.release();
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/schedule/scheduled-courses — only for active period
// ═════════════════════════════════════════════════════════════════════════════
export const getScheduledCourses = async (req, res) => {
    try {
        const periodId = await resolveActivePeriod(null, req.query.period_id);
        const semester = await getActiveSemesterLabel(null, req.query.period_id);
        const [rows] = await db.execute(
            `SELECT se.id, se.slot_id, se.course_code,
                    c.course_name, c.total_students, c.short_name,
                    GROUP_CONCAT(COALESCE(u.full_name, ci.instructor_name) SEPARATOR ', ') AS instructors,
                    es.exam_date, es.exam_day, es.start_time, es.end_time
             FROM scheduled_exams se
             JOIN exam_slots es ON se.slot_id = es.id
             JOIN courses c ON se.course_code = c.course_code AND c.semester_label = ?
             LEFT JOIN course_instructors ci
                ON c.course_code = ci.course_code AND ci.semester_label = c.semester_label
             LEFT JOIN users u ON ci.employee_id = u.employee_id
             WHERE es.exam_period_id = ?
             GROUP BY se.id, se.slot_id, se.course_code, c.course_name, c.total_students, c.short_name,
                      es.exam_date, es.exam_day, es.start_time, es.end_time
             ORDER BY es.exam_date, es.start_time, c.course_code`,
            [semester, periodId]
        );
        res.status(200).json({ success: true, scheduled: rows });
    } catch (error) {
        const status = error.http || 500;
        console.error('getScheduledCourses error:', error);
        res.status(status).json({ success: false, message: error.message || 'Failed to fetch scheduled courses.' });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  DELETE /api/schedule/unassign/:id
//  (No period scoping needed — id is the PK of scheduled_exams, which is
//  already locked to a slot in some period.)
// ═════════════════════════════════════════════════════════════════════════════
export const unassignCourse = async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute('DELETE FROM seating_allocations WHERE scheduled_exam_id = ?', [id]);
        const [result] = await db.execute('DELETE FROM scheduled_exams WHERE id = ?', [id]);
        if (result.affectedRows === 0)
            return res.status(404).json({ success: false, message: 'Scheduled exam not found.' });
        res.status(200).json({ success: true, message: 'Course unassigned successfully.' });
    } catch (error) {
        console.error('unassignCourse error:', error);
        res.status(500).json({ success: false, message: 'Failed to unassign course.', error: error.message });
    }
};
