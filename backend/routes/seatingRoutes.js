import express from 'express';
import { protect, requireAdmin } from '../middleware/middleware1.js';
import { generateMicroPlan, getPlanView, getSeatingStatus } from '../controllers/seatingController.js';
import { saveSession, getAllSessions, getSessionById, deleteSession } from '../controllers/examSessionController.js';

const router = express.Router();

router.use(protect, requireAdmin);

// POST /api/seating/generate-plan
router.post('/generate-plan', generateMicroPlan);

// GET /api/seating/view-plan
router.get('/view-plan', getPlanView);

// GET /api/seating/status — per-slot has-micro-plan indicator
router.get('/status', getSeatingStatus);

// Exam Session CRUD
router.post('/sessions/save', saveSession);
router.get('/sessions', getAllSessions);
router.get('/sessions/:id', getSessionById);
router.delete('/sessions/:id', deleteSession);

export default router;
