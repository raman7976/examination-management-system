import db from '../config/mysql.js';

// 2. Get All Slots (Step 2 - Dropdown)
export const getAvailableSlots = async (req, res) => {
    try {
        // Fetch ALL slots because they can be reused
        const [rows] = await db.execute('SELECT * FROM exam_slots ORDER BY exam_date, start_time');
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error });
    }
};

// 3. Schedule an Exam (Step 2 - Submit)
export const scheduleBatchExams = async (req, res) => {
    const { courses } = req.body;

    // Safety check to ensure we actually received data
    if (!courses || !Array.isArray(courses) || courses.length === 0) {
        return res.status(400).json({ message: "No courses provided to schedule." });
    }

    try {
        // Map the array of objects into an array of arrays for MySQL
        // The order MUST match the query below: [slot_id, course_name, instructor_name, student_count]
        const values = courses.map(course => [
            course.slotId,
            course.courseName,
            course.instructor,
            course.studentCount
        ]);

        const query = 'INSERT INTO scheduled_exams (slot_id, course_name, instructor_name, student_count) VALUES ?';
        
        // Use db.query for the bulk '?' syntax, and wrap values in an extra array [values]
        const [result] = await db.query(query, [values]);

        res.status(201).json({ 
            message: `Successfully scheduled ${result.affectedRows} courses!` 
        });
    } catch (error) {
        console.error("Batch schedule error:", error);
        res.status(500).json({ message: 'Server Error during batch scheduling', error: error.message });
    }
};

export const addBatchExamSlots = async (req, res) => {
    const { slots } = req.body;
    
    // Safety check
    if (!slots || !Array.isArray(slots) || slots.length === 0) {
        return res.status(400).json({ message: "No slots provided for generation." });
    }

    try {
        // Map the array of objects into an array of arrays for MySQL bulk insert
        // Format: [ [date1, day1, start1, end1], [date2, day2, start2, end2], ... ]
        const values = slots.map(slot => [
            slot.date, 
            slot.day, 
            slot.startTime, 
            slot.endTime
        ]);

        // Using db.query instead of db.execute because db.query supports the bulk '?' syntax natively
        const query = 'INSERT INTO exam_slots (exam_date, exam_day, start_time, end_time) VALUES ?';
        
        // Notice the extra array wrapping [values] - this is required by the mysql2 library for bulk inserts
        const [result] = await db.query(query, [values]);
        
        res.status(201).json({ 
            message: `Successfully generated ${result.affectedRows} exam slots!` 
        });
    } catch (error) {
        console.error("Batch insert error:", error);
        res.status(500).json({ message: 'Server Error during batch generation', error: error.message });
    }
};