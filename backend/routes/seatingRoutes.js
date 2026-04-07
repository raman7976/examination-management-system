import express from 'express';
import { protect } from '../middleware/middleware1.js';
import { generateMicroPlan, getPlanView } from '../controllers/seatingController.js';

const router = express.Router();

router.use(protect);

// POST /api/seating/generate-plan
router.post('/generate-plan', generateMicroPlan);

// GET /api/seating/view-plan
router.get('/view-plan', getPlanView);

export default router;
