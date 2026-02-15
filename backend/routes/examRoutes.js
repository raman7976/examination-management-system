import express from 'express';
import { addExamSlot, getAvailableSlots, scheduleExam } from '../controllers/examController.js';

const router = express.Router();

// Route to add a new date/time slot (Step 1)
router.post('/add-slot', addExamSlot);

// Route to get list of slots for the dropdown (Step 2)
router.get('/available-slots', getAvailableSlots);

// Route to actually book the exam (Step 2 submit)
router.post('/schedule', scheduleExam);

export default router;