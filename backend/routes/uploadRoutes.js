import express from 'express';
import multer from 'multer';
import { protect, requireAdmin } from '../middleware/middleware1.js';
import { uploadCourses, uploadEnrollments, resetSemesterData, getCourseList, getEnrollmentList, uploadCourseInstructors, downloadCourseInstructorTemplate, getEnrollmentMismatches } from '../controllers/uploadController.js';

const router = express.Router();

// ═════════════════════════════════════════════════════════════════════════════
//  MULTER CONFIG — Memory Storage
// ═════════════════════════════════════════════════════════════════════════════

// For .xlsx Course Master uploads
const xlsxUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, cb) => {
        const isXlsx =
            file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.originalname.toLowerCase().endsWith('.xlsx');
        cb(isXlsx ? null : new Error('INVALID_FILE_TYPE_XLSX'), isXlsx);
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

// For .zip Enrollment uploads
const zipUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, cb) => {
        const isZip =
            file.mimetype === 'application/zip' ||
            file.mimetype === 'application/x-zip-compressed' ||
            file.originalname.toLowerCase().endsWith('.zip');
        cb(isZip ? null : new Error('INVALID_FILE_TYPE_ZIP'), isZip);
    },
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max (zip can be large)
});


// ═════════════════════════════════════════════════════════════════════════════
//  MULTER ERROR WRAPPERS
//  Catches multer-specific errors and returns clean JSON instead of crashing
// ═════════════════════════════════════════════════════════════════════════════

const handleUpload = (multerMiddleware) => (req, res, next) => {
    multerMiddleware(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ success: false, message: `Upload Error: ${err.message}` });
        }
        if (err) {
            if (err.message === 'INVALID_FILE_TYPE_XLSX') {
                return res.status(400).json({ success: false, message: 'Only .xlsx files are accepted for course upload.' });
            }
            if (err.message === 'INVALID_FILE_TYPE_ZIP') {
                return res.status(400).json({ success: false, message: 'Only .zip files are accepted for enrollment upload.' });
            }
            return res.status(500).json({ success: false, message: 'An unknown upload error occurred.' });
        }
        next();
    });
};


// ═════════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTE — No auth needed
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/upload/course-instructor-template — downloadable .xlsx template
router.get('/course-instructor-template', downloadCourseInstructorTemplate);

// ═════════════════════════════════════════════════════════════════════════════
//  ROUTES — Admin-only (JWT auth + admin role)
// ═════════════════════════════════════════════════════════════════════════════

router.use(protect, requireAdmin);

// POST /api/upload/courses — Course Master (.xlsx)
router.post(
    '/courses',
    handleUpload(xlsxUpload.single('file')),
    uploadCourses
);

// POST /api/upload/enrollments — Student Enrollments (.zip of .xlsx)
router.post(
    '/enrollments',
    handleUpload(zipUpload.single('file')),
    uploadEnrollments
);

// DELETE /api/upload/reset — Wipe semester data
router.delete('/reset', resetSemesterData);

// GET /api/upload/courses — Fetch course master list (with optional search)
router.get('/courses', getCourseList);

// GET /api/upload/enrollments — Fetch enrollment list (with optional search)
router.get('/enrollments', getEnrollmentList);

// GET /api/upload/enrollment-mismatches — Persistent expected-vs-actual gap
router.get('/enrollment-mismatches', getEnrollmentMismatches);

// POST /api/upload/course-instructors — Link invigilators to courses via Excel
router.post(
    '/course-instructors',
    handleUpload(xlsxUpload.single('file')),
    uploadCourseInstructors
);

export default router;
