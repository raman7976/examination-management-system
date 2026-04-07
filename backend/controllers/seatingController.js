import db from '../config/mysql.js';

// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/seating/generate-plan
//  Generates micro-seating individual plans using the "Zip Algorithm"
// ═════════════════════════════════════════════════════════════════════════════

export const generateMicroPlan = async (req, res) => {
    const { slot_id } = req.body;
    if (!slot_id) return res.status(400).json({ success: false, message: 'slot_id is required' });

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Fetch all seating allocations for the given slot
        const [allocations] = await conn.execute(`
            SELECT sa.id AS allocation_id, sa.classroom_id, sa.lane, sa.student_count, se.course_code
            FROM seating_allocations sa
            JOIN scheduled_exams se ON sa.scheduled_exam_id = se.id
            WHERE se.slot_id = ?
            ORDER BY sa.classroom_id ASC, sa.lane ASC
        `, [slot_id]);

        if (allocations.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'No seating allocations found for this slot.' });
        }

        // 2. Clear existing micro-plans for this slot to allow a clean overwrite
        const allocationIds = allocations.map(a => a.allocation_id);
        if (allocationIds.length > 0) {
            const placeholders = allocationIds.map(() => '?').join(',');
            await conn.execute(`DELETE FROM individual_seating_plans WHERE allocation_id IN (${placeholders})`, allocationIds);
        }

        const newPlans = [];
        const courseStudentOffset = {}; // Tracks next available student index per course

        // 3. For each allocation, fetch students, fetch chairs, and Zip them!
        for (const alloc of allocations) {
            // First time we see a course in this slot, load its students ordered by roll_number
            if (courseStudentOffset[alloc.course_code] === undefined) {
                const [students] = await conn.execute(`
                    SELECT ce.roll_number 
                    FROM course_enrollments ce
                    WHERE ce.course_code = ?
                    ORDER BY ce.roll_number ASC
                `, [alloc.course_code]);
                courseStudentOffset[alloc.course_code] = { students, index: 0 };
            }

            const courseTracker = courseStudentOffset[alloc.course_code];

            // Fetch physical chairs blueprint for this specific room and lane, ordered physically
            const [chairs] = await conn.execute(`
                SELECT seat_number 
                FROM classroom_seats 
                WHERE classroom_id = ? AND lane = ?
                ORDER BY seq_order ASC
            `, [alloc.classroom_id, alloc.lane]);

            let allocatedCount = 0;
            let chairIdx = 0;

            // Zip 1-to-1
            while (allocatedCount < alloc.student_count && courseTracker.index < courseTracker.students.length && chairIdx < chairs.length) {
                const student = courseTracker.students[courseTracker.index];
                const chair = chairs[chairIdx];

                newPlans.push([
                    alloc.allocation_id,
                    student.roll_number,
                    chair.seat_number
                ]);

                courseTracker.index++;
                chairIdx++;
                allocatedCount++;
            }
        }

        // 4. Bulk INSERT IGNORE into individual_seating_plans
        if (newPlans.length > 0) {
            await conn.query(`
                INSERT IGNORE INTO individual_seating_plans (allocation_id, roll_number, seat_number)
                VALUES ?
            `, [newPlans]);
        }

        await conn.commit();

        res.status(200).json({
            success: true,
            message: `Successfully generated micro-plan! mapped ${newPlans.length} students to chairs.`,
            mapped_students: newPlans.length
        });

    } catch (error) {
        await conn.rollback();
        console.error('generateMicroPlan error:', error);
        res.status(500).json({ success: false, message: 'Server Error during Zip Algorithm', error: error.message });
    } finally {
        conn.release();
    }
};

// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/seating/view-plan?slot_id=1&classroom_id=1
//  Fetches combined individual seating data for rendering the UI Grid / downloading
// ═════════════════════════════════════════════════════════════════════════════

export const getPlanView = async (req, res) => {
    const { slot_id, classroom_id } = req.query;

    if (!slot_id) {
        return res.status(400).json({ success: false, message: 'slot_id is required as a query param' });
    }

    try {
        let query = `
            SELECT 
                isp.seat_number, 
                sa.lane, 
                isp.roll_number, 
                st.name AS student_name, 
                se.course_code,
                cl.room_name,
                sa.classroom_id
            FROM individual_seating_plans isp
            JOIN seating_allocations sa ON isp.allocation_id = sa.id
            JOIN scheduled_exams se ON sa.scheduled_exam_id = se.id
            JOIN students st ON isp.roll_number = st.roll_number
            JOIN classroom_seats cs ON (cs.classroom_id = sa.classroom_id AND cs.lane = sa.lane AND cs.seat_number = isp.seat_number)
            JOIN classrooms cl ON sa.classroom_id = cl.id
            WHERE se.slot_id = ?
        `;
        const params = [slot_id];

        if (classroom_id) {
            query += ' AND sa.classroom_id = ?';
            params.push(classroom_id);
        }

        query += ' ORDER BY cl.location_order ASC, cs.seq_order ASC';

        const [rows] = await db.execute(query, params);
        res.status(200).json({ success: true, count: rows.length, data: rows });
    } catch (error) {
        console.error('getPlanView error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch the seating plan', error: error.message });
    }
};
