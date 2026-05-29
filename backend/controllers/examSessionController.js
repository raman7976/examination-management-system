import db from '../config/mysql.js';
import { resolveActivePeriod } from '../utils/periodResolver.js';

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/seating/sessions/save
//  Snapshots the current seating allocation into exam_sessions + exam_session_seating
// ═════════════════════════════════════════════════════════════════════════════

export const saveSession = async (req, res) => {
    const { exam_type, semester_type, academic_year } = req.body;

    if (!exam_type || !semester_type || !academic_year) {
        return res.status(400).json({ success: false, message: 'exam_type, semester_type, and academic_year are required.' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Resolve the active period: a "save" archives the CURRENT exam's seating.
        // Without this scope the gather query would archive every period's data
        // into one session — silently mixing midterm + endterm + old semesters.
        const periodId = await resolveActivePeriod(conn, req.body.period_id);

        // Gather seating data for the active period only. The courses JOIN matches
        // on (course_code, semester_label) — `courses` has a composite PK so the
        // single-column join would pick whichever copy of the course MySQL hits
        // first, mislabelling course_name when the same course exists in multiple
        // semesters.
        const [allSeating] = await conn.execute(`
            SELECT
                se.slot_id, es.exam_date, es.start_time, es.end_time,
                isp.roll_number, st.name AS student_name, st.section_name,
                se.course_code, c.course_name,
                isp.seat_number, cl.room_name, sa.lane
            FROM individual_seating_plans isp
            JOIN seating_allocations sa ON isp.allocation_id = sa.id
            JOIN scheduled_exams se ON sa.scheduled_exam_id = se.id
            JOIN exam_slots es ON se.slot_id = es.id
            JOIN exam_periods ep ON ep.id = es.exam_period_id
            JOIN courses c
              ON c.course_code = se.course_code
             AND c.semester_label = ep.semester_label
            JOIN students st ON isp.roll_number = st.roll_number
            JOIN classrooms cl ON sa.classroom_id = cl.id
            WHERE es.exam_period_id = ?
            ORDER BY es.exam_date, es.start_time, cl.room_name
        `, [periodId]);

        if (allSeating.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'No seating data found to save. Generate micro-seating plans first.' });
        }

        const uniqueCourses = new Set(allSeating.map(r => r.course_code));

        // Insert session metadata
        const [sessionResult] = await conn.execute(
            'INSERT INTO exam_sessions (exam_type, semester_type, academic_year, total_students, total_courses) VALUES (?, ?, ?, ?, ?)',
            [exam_type, semester_type, academic_year, allSeating.length, uniqueCourses.size]
        );
        const sessionId = sessionResult.insertId;

        // Bulk insert seating snapshot
        const values = allSeating.map(r => [
            sessionId, r.slot_id, r.exam_date, r.start_time, r.end_time,
            r.roll_number, r.student_name, r.section_name,
            r.course_code, r.course_name,
            r.seat_number, r.room_name, r.lane
        ]);

        if (values.length > 0) {
            await conn.query(
                `INSERT INTO exam_session_seating 
                    (session_id, slot_id, exam_date, start_time, end_time, roll_number, student_name, section_name, course_code, course_name, seat_number, room_name, lane)
                 VALUES ?`,
                [values]
            );
        }

        await conn.commit();

        res.status(201).json({
            success: true,
            message: `Session saved! ${allSeating.length} student-seat records archived.`,
            session_id: sessionId,
        });

    } catch (error) {
        await conn.rollback();
        console.error('saveSession error:', error);
        res.status(500).json({ success: false, message: 'Failed to save session.', error: error.message });
    } finally {
        conn.release();
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/seating/sessions
//  Lists all saved exam sessions
// ═════════════════════════════════════════════════════════════════════════════

export const getAllSessions = async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM exam_sessions ORDER BY saved_at DESC'
        );
        res.json({ success: true, sessions: rows });
    } catch (error) {
        console.error('getAllSessions error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/seating/sessions/:id
//  Retrieves a saved session's full seating data
// ═════════════════════════════════════════════════════════════════════════════

export const getSessionById = async (req, res) => {
    const { id } = req.params;
    try {
        const [meta] = await db.execute('SELECT * FROM exam_sessions WHERE id = ?', [id]);
        if (meta.length === 0) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }

        const [seating] = await db.execute(
            'SELECT * FROM exam_session_seating WHERE session_id = ? ORDER BY exam_date, start_time, room_name, roll_number',
            [id]
        );

        res.json({ success: true, session: meta[0], data: seating });
    } catch (error) {
        console.error('getSessionById error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  DELETE /api/seating/sessions/:id
// ═════════════════════════════════════════════════════════════════════════════

export const deleteSession = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.execute('DELETE FROM exam_sessions WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Session not found.' });
        }
        res.json({ success: true, message: 'Session deleted.' });
    } catch (error) {
        console.error('deleteSession error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
