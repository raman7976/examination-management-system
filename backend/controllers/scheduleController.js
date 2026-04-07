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
            `SELECT c.course_code, c.course_name, c.total_students,
                    GROUP_CONCAT(ci.instructor_name SEPARATOR ', ') AS instructors
             FROM courses c
             LEFT JOIN course_instructors ci ON c.course_code = ci.course_code
             WHERE c.course_code NOT IN (SELECT course_code FROM scheduled_exams)
             GROUP BY c.course_code
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
