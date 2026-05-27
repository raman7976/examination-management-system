import db from '../config/mysql.js';

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/schedule/slots
//  Fetch all rows from exam_slots, ordered by date then time
// ═════════════════════════════════════════════════════════════════════════════

export const getSlots = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, exam_date, exam_day, start_time, end_time
             FROM exam_slots
             ORDER BY exam_date, start_time`
        );

        res.status(200).json({ success: true, slots: rows });
    } catch (error) {
        console.error('getSlots error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch exam slots.', error: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/schedule/unscheduled-courses
//  Fetch courses NOT yet in scheduled_exams, with instructor names joined
// ═════════════════════════════════════════════════════════════════════════════

export const getUnscheduledCourses = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT c.course_code, c.course_name, c.total_students, c.short_name,
                    GROUP_CONCAT(COALESCE(u.full_name, ci.instructor_name) SEPARATOR ', ') AS instructors
             FROM courses c
             LEFT JOIN course_instructors ci ON c.course_code = ci.course_code
             LEFT JOIN users u ON ci.user_id = u.id
             WHERE c.course_code NOT IN (SELECT course_code FROM scheduled_exams)
             GROUP BY c.course_code, c.course_name, c.total_students, c.short_name
             ORDER BY c.course_code`
        );

        res.status(200).json({ success: true, courses: rows });
    } catch (error) {
        console.error('getUnscheduledCourses error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch unscheduled courses.', error: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/schedule/assign
//  Accepts: { slot_id, course_codes: ['CSE437', 'MTH101', ...] }
//  Bulk inserts into scheduled_exams in a transaction
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
        await conn.rollback();
        console.error('assignCourses error:', dbErr);

        // Handle duplicate entry gracefully
        if (dbErr.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'One or more courses are already scheduled. Please refresh and try again.',
            });
        }

        res.status(500).json({ success: false, message: 'Failed to assign courses to slot.', error: dbErr.message });
    } finally {
        conn.release();
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/schedule/scheduled-courses
//  Fetch all courses that ARE in scheduled_exams, grouped by slot
// ═════════════════════════════════════════════════════════════════════════════

export const getScheduledCourses = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT se.id, se.slot_id, se.course_code,
                    c.course_name, c.total_students, c.short_name,
                    GROUP_CONCAT(COALESCE(u.full_name, ci.instructor_name) SEPARATOR ', ') AS instructors,
                    es.exam_date, es.exam_day, es.start_time, es.end_time
             FROM scheduled_exams se
             JOIN courses c ON se.course_code = c.course_code
             LEFT JOIN course_instructors ci ON c.course_code = ci.course_code
             LEFT JOIN users u ON ci.user_id = u.id
             JOIN exam_slots es ON se.slot_id = es.id
             GROUP BY se.id, se.slot_id, se.course_code, c.course_name, c.total_students, c.short_name,
                      es.exam_date, es.exam_day, es.start_time, es.end_time
             ORDER BY es.exam_date, es.start_time, c.course_code`
        );

        res.status(200).json({ success: true, scheduled: rows });
    } catch (error) {
        console.error('getScheduledCourses error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch scheduled courses.', error: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  DELETE /api/schedule/unassign/:id
//  Remove a single scheduled_exam entry by its primary key
// ═════════════════════════════════════════════════════════════════════════════

export const unassignCourse = async (req, res) => {
    const { id } = req.params;
    try {
        // Also clean up any seating allocations that reference this scheduled exam
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
