import express from 'express';
import { protect, requireAdmin } from '../middleware/middleware1.js';
import {
    listExamPeriods,
    createSemester,
    activateExamPeriod,
    deleteExamPeriod,
    getRoleTargets,
    updateRoleTargets,
    getInvigilatorList,
    updateOverride,
    generateSchedule,
    previewSchedule,
    getSchedule,
    addAssignment,
    reassignAssignment,
    removeAssignment,
    getEligibleForSlot,
    applyChanges,
    clearSchedule,
} from '../controllers/invigilatorSchedulingController.js';

const router = express.Router();

// Admin-only across the board
router.use(protect, requireAdmin);

// ── Exam-period CRUD ────────────────────────────────────────────────────────
router.get('/exam-periods',                listExamPeriods);
router.post('/semesters',                  createSemester);     // creates midterm + endterm pair
router.put('/exam-periods/:id/activate',   activateExamPeriod);
router.delete('/exam-periods/:id',         deleteExamPeriod);

// ── Role targets ────────────────────────────────────────────────────────────
router.get('/role-targets', getRoleTargets);
router.put('/role-targets', updateRoleTargets);

// ── Invigilator list + per-user overrides ───────────────────────────────────
router.get('/invigilators',                  getInvigilatorList);
router.put('/invigilators/:user_id/override', updateOverride);

// ── Schedule generation, read, batched edits, wipe ──────────────────────────
router.post('/generate',         generateSchedule);   // legacy: generate + save in one call
router.post('/generate-preview', previewSchedule);    // run algorithm in-memory, no DB write
router.post('/apply-changes',  applyChanges);
router.get('/schedule',        getSchedule);
router.delete('/schedule',     clearSchedule);

// ── Helpers / per-row edits ─────────────────────────────────────────────────
router.get('/eligible',                  getEligibleForSlot);
router.post('/assignments',              addAssignment);
router.put('/assignments/:id/reassign',  reassignAssignment);
router.delete('/assignments/:id',        removeAssignment);

export default router;
