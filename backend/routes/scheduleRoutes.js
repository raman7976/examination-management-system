import express from 'express';
import { protect } from '../middleware/middleware1.js';
import { getSlots, getUnscheduledCourses, getScheduledCourses, assignCourses, unassignCourse } from '../controllers/scheduleController.js';

const router = express.Router();

// ═════════════════════════════════════════════════════════════════════════════
//  All schedule routes are protected by JWT auth
// ═════════════════════════════════════════════════════════════════════════════

router.use(protect);

// GET  /api/schedule/slots               — Fetch all exam slots
router.get('/slots', getSlots);

// GET  /api/schedule/unscheduled-courses  — Fetch courses not yet scheduled
router.get('/unscheduled-courses', getUnscheduledCourses);

// GET  /api/schedule/scheduled-courses    — Fetch courses already scheduled
router.get('/scheduled-courses', getScheduledCourses);

// POST /api/schedule/assign              — Bulk assign courses to a slot
router.post('/assign', assignCourses);

// DELETE /api/schedule/unassign/:id      — Remove a course from its slot
router.delete('/unassign/:id', unassignCourse);

export default router;
