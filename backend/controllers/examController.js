import db from '../config/mysql.js';

// 1. Add Available Time Slot (Step 1)
export const addExamSlot = async (req, res) => {
    const { date, day, startTime, endTime } = req.body;
    
    try {
        const query = 'INSERT INTO exam_slots (exam_date, exam_day, start_time, end_time) VALUES (?, ?, ?, ?)';
        await db.execute(query, [date, day, startTime, endTime]);
        
        res.status(201).json({ message: 'Time slot created successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error', error });
    }
};


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
export const scheduleExam = async (req, res) => {
    const { slotId, courseName, instructor, studentCount } = req.body;

    try {
        // Directly insert the exam schedule linked to the slot
        const query = 'INSERT INTO scheduled_exams (slot_id, course_name, instructor_name, student_count) VALUES (?, ?, ?, ?)';
        
        await db.execute(query, [slotId, courseName, instructor, studentCount]);

        res.status(201).json({ message: 'Exam scheduled successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error', error });
    }
};
