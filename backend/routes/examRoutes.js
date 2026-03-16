import express from 'express';
import { 
    getAvailableSlots, 
    addBatchExamSlots, 
    scheduleBatchExams 
} from '../controllers/examController.js';

const router = express.Router();

// ---------------------------------------------------
// PHASE 1: GENERATE EXAM SLOTS
// ---------------------------------------------------

// Route to generate and insert multiple exam dates/times at once
router.post('/add-batch-slots', addBatchExamSlots);


// ---------------------------------------------------
// PHASE 2: SCHEDULE COURSES INTO SLOTS
// ---------------------------------------------------

// Route to get the list of generated slots (used by the Excel Template Generator)
router.get('/available-slots', getAvailableSlots);

// Route to handle the bulk saving of courses from the uploaded Excel file
router.post('/schedule-batch', scheduleBatchExams); 

export default router;