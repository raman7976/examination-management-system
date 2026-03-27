import express  from 'express';
import multer   from 'multer';
import { protect } from '../middleware/middleware1.js';
// Controllers
import {
    // Phase 1
    addBatchExamSlots,
    updateExamSlot,
    deleteExamSlot,

    // Phase 2
    getAvailableSlots,
    scheduleBatchExams,

    // Phase 3
    getClassrooms,
    addClassroom,

    // Phase 4
    getSeatingStatus,
    generateAndExportAllSeating,
    uploadAndSaveSeating,
    getSeatingPlan,
} from '../controllers/examController.js';

const router = express.Router();





// ==========================================
// UPLOAD CONFIGURATION & SAFETY
// ==========================================
// Multer: store uploaded Excel in memory (no disk I/O needed)



const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, cb) => {
        const ok = file.mimetype ===
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            || file.originalname.endsWith('.xlsx');
        cb(ok ? null : new Error('Only .xlsx files are accepted.'), ok);
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});


// 🛡️ NEW: Multer Error Wrapper
// This prevents Multer from crashing the app if the file is too big or the wrong type
const handleSeatingUpload = (req, res, next) => {
    const uploadSingle = upload.single('seatingFile');

    uploadSingle(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred when uploading (e.g., file too large).
            return res.status(400).json({ success: false, message: `Upload Error: ${err.message}` });
        } else if (err) {
            // An unknown error occurred (e.g., our INVALID_FILE_TYPE error).
            if (err.message === 'INVALID_FILE_TYPE') {
                return res.status(400).json({ success: false, message: 'Only .xlsx files are accepted.' });
            }
            return res.status(500).json({ success: false, message: 'An unknown upload error occurred.' });
        }
        // Everything went fine, move to the actual controller
        next();
    });
};




router.use(protect);
// ─────────────────────────────────────────────────────────────────────────────
//  PHASE 1 – EXAM SLOTS
//  POST /api/exams/add-batch-slots
// ─────────────────────────────────────────────────────────────────────────────
router.post('/add-batch-slots', addBatchExamSlots);
router.put('/slots/:id', updateExamSlot);
router.delete('/slots/:id', deleteExamSlot);





// ─────────────────────────────────────────────────────────────────────────────
//  PHASE 2 – SCHEDULE COURSES INTO SLOTS
//  GET  /api/exams/available-slots
//  POST /api/exams/schedule-batch
// ─────────────────────────────────────────────────────────────────────────────
router.get('/available-slots',  getAvailableSlots);
router.post('/schedule-batch', scheduleBatchExams);





// ─────────────────────────────────────────────────────────────────────────────
//  PHASE 3 – CLASSROOMS
//  GET  /api/exams/classrooms
//  POST /api/exams/classrooms
// ─────────────────────────────────────────────────────────────────────────────
router.get('/classrooms',  getClassrooms);
router.post('/classrooms', addClassroom);





// ─────────────────────────────────────────────────────────────────────────────
//  PHASE 4 – SEATING ENGINE  (Human-in-the-loop workflow)
//
//  Step A:  GET  /api/exams/seating-status
//             → returns all slots + whether each has a saved seating plan
//
//  Step B:  POST /api/exams/generate-export
//             Body: { enabledRoomIds?: number[] }
//             → runs algorithm for ALL slots, returns .xlsx workbook download
//
//  Step C:  POST /api/exams/upload-seating   (multipart field: "seatingFile")
//             → parses reviewed .xlsx, overwrites seating_allocations in DB
//
//  Step D:  GET  /api/exams/slots/:slotId/seating
//             → retrieve the saved seating plan for one slot (for display / PDF)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/seating-status',                   getSeatingStatus);
router.post('/generate-export',                 generateAndExportAllSeating);
router.post('/upload-seating',
    upload.single('seatingFile'),               uploadAndSaveSeating);
router.get('/slots/:slotId/seating',            getSeatingPlan);




export default router;