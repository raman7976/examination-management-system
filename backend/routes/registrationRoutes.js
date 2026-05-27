import express from 'express';
import multer from 'multer';
import { protect, requireAdmin } from '../middleware/middleware1.js';
import {
    downloadTemplate,
    registerInvigilator,
    bulkRegisterInvigilators,
    getInvigilators,
    deleteInvigilator,
} from '../controllers/registrationController.js';

const router = express.Router();

// ── Multer config (same pattern as uploadRoutes.js) ───────────────────────────
const xlsxUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, cb) => {
        const isXlsx =
            file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.originalname.toLowerCase().endsWith('.xlsx');
        cb(isXlsx ? null : new Error('INVALID_FILE_TYPE_XLSX'), isXlsx);
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const handleUpload = (multerMiddleware) => (req, res, next) => {
    multerMiddleware(req, res, (err) => {
        if (err instanceof multer.MulterError)
            return res.status(400).json({ success: false, message: `Upload Error: ${err.message}` });
        if (err)
            return res.status(400).json({ success: false, message: 'Only .xlsx files are accepted.' });
        next();
    });
};

// ── Public route — no auth needed ────────────────────────────────────────────
router.get('/template', downloadTemplate);

// ── All routes below require: valid JWT + admin role ─────────────────────────
router.use(protect, requireAdmin);

router.post('/register', registerInvigilator);
router.post('/bulk-upload', handleUpload(xlsxUpload.single('file')), bulkRegisterInvigilators);
router.get('/invigilators', getInvigilators);
router.delete('/invigilators/:id', deleteInvigilator);

export default router;
