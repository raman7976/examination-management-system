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
//  Two sub-routers under the same mount prefix (/api/invigilator-scheduling).
//  They never collide because their URLs differ. Splitting lets us attach
//  different role middleware (requireAdmin vs requireInvigilator) per group
//  without per-route boilerplate.
// ═════════════════════════════════════════════════════════════════════════════

// ─── Admin-only routes ──────────────────────────────────────────────────────
const adminRouter = express.Router();
adminRouter.use(protect, requireAdmin);

// Exam-period CRUD
adminRouter.get('/exam-periods',                listExamPeriods);
adminRouter.get('/periods-overview',            getPeriodsOverview);  // per-period data counts
adminRouter.post('/semesters',                  createSemester);     // creates midterm + endterm pair
adminRouter.put('/exam-periods/:id/activate',   activateExamPeriod);
adminRouter.delete('/exam-periods/:id',         deleteExamPeriod);

// Role targets
adminRouter.get('/role-targets', getRoleTargets);
adminRouter.put('/role-targets', updateRoleTargets);

// Invigilator list + per-user overrides
adminRouter.get('/invigilators',                  getInvigilatorList);
adminRouter.put('/invigilators/:user_id/override', updateOverride);

// Schedule generation, read, batched edits, wipe
adminRouter.post('/generate',         generateSchedule);   // legacy: generate + save in one call
adminRouter.post('/generate-preview', previewSchedule);    // run algorithm in-memory, no DB write
adminRouter.post('/apply-changes',    applyChanges);
adminRouter.get('/schedule',          getSchedule);
adminRouter.delete('/schedule',       clearSchedule);

// Helpers / per-row edits
adminRouter.get('/eligible',                  getEligibleForSlot);
adminRouter.post('/assignments',              addAssignment);
adminRouter.put('/assignments/:id/reassign',  reassignAssignment);
adminRouter.delete('/assignments/:id',        removeAssignment);

// Swap moderation
adminRouter.get('/swap-requests',                    listSwapRequestsAdmin);
adminRouter.put('/swap-requests/:id/admin-respond',  adminRespondToSwap);

// ─── Invigilator-only routes (faculty / phd_student / lab_staff) ────────────
const inviRouter = express.Router();
inviRouter.use(protect, requireInvigilator);

inviRouter.get   ('/my-schedule',                       getMySchedule);
inviRouter.get   ('/swap-eligible',                     listSwapEligibleTargets);
inviRouter.post  ('/swap-requests',                     createSwapRequest);
inviRouter.get   ('/swap-requests/incoming',            listIncomingSwapRequests);
inviRouter.get   ('/swap-requests/outgoing',            listOutgoingSwapRequests);
inviRouter.put   ('/swap-requests/:id/peer-respond',    peerRespondToSwap);
inviRouter.delete('/swap-requests/:id',                 cancelOwnSwapRequest);

router.use(adminRouter);
router.use(inviRouter);

export default router;
