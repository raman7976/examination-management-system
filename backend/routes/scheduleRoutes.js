import express from 'express';
import { protect } from '../middleware/middleware1.js';
import { getSlots, getUnscheduledCourses, assignCourses } from '../controllers/scheduleController.js';

const router = express.Router();

// ═════════════════════════════════════════════════════════════════════════════
//  All schedule routes are protected by JWT auth
// ═════════════════════════════════════════════════════════════════════════════

router.use(protect);

// GET  /api/schedule/slots               — Fetch all exam slots
router.get('/slots', getSlots);

// GET  /api/schedule/unscheduled-courses  — Fetch courses not yet scheduled
router.get('/unscheduled-courses', getUnscheduledCourses);

// POST /api/schedule/assign              — Bulk assign courses to a slot
router.post('/assign', assignCourses);

export default router;
