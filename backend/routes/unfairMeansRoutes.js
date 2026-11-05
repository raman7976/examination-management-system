import express from 'express';
import multer from 'multer';
import { protect, requireAdmin } from '../middleware/middleware1.js';
import {
    getSessionStudents,
    createCase,
    listCases,
    getCase,
    updateCase,
    reviewCase,
    uploadPhotos,
    getPhoto,
    deletePhoto,
    MAX_PHOTOS,
    MAX_PHOTO_BYTES,
} from '../controllers/unfairMeansController.js';

const router = express.Router();

// The unfair-means register belongs to the examination department alone:
// invigilators have no access to any of these endpoints.
router.use(protect, requireAdmin);

// Evidence photos, kept in memory then stored in the DB. The image type is
// verified from the file's signature in the controller.
const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS },
});
const handlePhotos = (req, res, next) => {
    photoUpload.array('photos', MAX_PHOTOS)(req, res, (err) => {
        if (!err) return next();
        const message = err.code === 'LIMIT_FILE_SIZE'
            ? `Each photo must be under ${MAX_PHOTO_BYTES / (1024 * 1024)} MB.`
            : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
                ? `Upload at most ${MAX_PHOTOS} photos.`
                : `Upload error: ${err.message}`;
        res.status(400).json({ success: false, message });
    });
};

router.get   ('/session-students',      getSessionStudents);
router.get   ('/',                      listCases);
router.post  ('/',                      createCase);
router.get   ('/:id',                   getCase);
router.put   ('/:id',                   updateCase);
router.put   ('/:id/review',            reviewCase);
router.post  ('/:id/photos',            handlePhotos, uploadPhotos);
router.get   ('/:id/photos/:photoId',   getPhoto);
router.delete('/:id/photos/:photoId',   deletePhoto);

export default router;
