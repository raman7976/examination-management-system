import express from 'express';
import { protect, requireAdmin, requireInvigilator } from '../middleware/middleware1.js';
import {
    listExamPeriods,
    createSemester,
    activateExamPeriod,
    deleteExamPeriod,
    getPeriodsOverview,
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
import {
    getMySchedule,
    getFullSchedule,
    listSwapEligibleTargets,
    createSwapRequest,
    listIncomingSwapRequests,
    listOutgoingSwapRequests,
    peerRespondToSwap,
    cancelOwnSwapRequest,
    listSwapRequestsAdmin,
    adminRespondToSwap,
} from '../controllers/invigilatorSwapController.js';

const router = express.Router();

// ═════════════════════════════════════════════════════════════════════════════
//  All endpoints live under one mount prefix (/api/invigilator-scheduling) but
//  fall into two access tiers. Guards are attached PER ROUTE (not router-wide):
//  a router-level `requireAdmin` would 403 every request — including invigilator
//  paths — before route matching could fall through to the invigilator handler.
// ═════════════════════════════════════════════════════════════════════════════

const adminOnly = [protect, requireAdmin];
const inviOnly  = [protect, requireInvigilator];

// ─── Admin-only routes ──────────────────────────────────────────────────────

// Exam-period CRUD
router.get   ('/exam-periods',              adminOnly, listExamPeriods);
router.get   ('/periods-overview',          adminOnly, getPeriodsOverview);  // per-period data counts
router.post  ('/semesters',                 adminOnly, createSemester);      // creates midterm + endterm pair
router.put   ('/exam-periods/:id/activate', adminOnly, activateExamPeriod);
router.delete('/exam-periods/:id',          adminOnly, deleteExamPeriod);

// Role targets
router.get('/role-targets', adminOnly, getRoleTargets);
router.put('/role-targets', adminOnly, updateRoleTargets);

// Invigilator list + per-user overrides
router.get('/invigilators',                   adminOnly, getInvigilatorList);
router.put('/invigilators/:user_id/override', adminOnly, updateOverride);

// Schedule generation, read, batched edits, wipe
router.post  ('/generate',         adminOnly, generateSchedule);   // legacy: generate + save in one call
router.post  ('/generate-preview', adminOnly, previewSchedule);    // run algorithm in-memory, no DB write
router.post  ('/apply-changes',    adminOnly, applyChanges);
router.get   ('/schedule',         adminOnly, getSchedule);
router.delete('/schedule',         adminOnly, clearSchedule);

// Helpers / per-row edits
router.get   ('/eligible',                 adminOnly, getEligibleForSlot);
router.post  ('/assignments',              adminOnly, addAssignment);
router.put   ('/assignments/:id/reassign', adminOnly, reassignAssignment);
router.delete('/assignments/:id',          adminOnly, removeAssignment);

// Swap moderation (admin)
router.get('/swap-requests',                   adminOnly, listSwapRequestsAdmin);
router.put('/swap-requests/:id/admin-respond', adminOnly, adminRespondToSwap);

// ─── Invigilator-only routes (faculty / phd_student / lab_staff) ────────────

router.get   ('/my-schedule',                    inviOnly, getMySchedule);
router.get   ('/full-schedule',                  inviOnly, getFullSchedule);   // whole grid, read-only
router.get   ('/swap-eligible',                  inviOnly, listSwapEligibleTargets);
router.post  ('/swap-requests',                  inviOnly, createSwapRequest);
router.get   ('/swap-requests/incoming',         inviOnly, listIncomingSwapRequests);
router.get   ('/swap-requests/outgoing',         inviOnly, listOutgoingSwapRequests);
router.put   ('/swap-requests/:id/peer-respond', inviOnly, peerRespondToSwap);
router.delete('/swap-requests/:id',              inviOnly, cancelOwnSwapRequest);

export default router;
