import express from 'express';
import { protect } from '../middleware/middleware1.js';
import { generateMicroPlan, getPlanView } from '../controllers/seatingController.js';
import { saveSession, getAllSessions, getSessionById, deleteSession } from '../controllers/examSessionController.js';

const router = express.Router();

router.use(protect);

// POST /api/seating/generate-plan
router.post('/generate-plan', generateMicroPlan);

// GET /api/seating/view-plan
router.get('/view-plan', getPlanView);

// Exam Session CRUD
router.post('/sessions/save', saveSession);
router.get('/sessions', getAllSessions);
router.get('/sessions/:id', getSessionById);
router.delete('/sessions/:id', deleteSession);

export default router;
