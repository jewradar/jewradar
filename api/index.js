import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { scoreHandler } from './score.js';
import { preprocessHandler, reloadHandler } from './preprocess.js';
import { shareUploadHandler, shareMetaHandler } from './share.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

/**
 * Build and return the API router.
 * store = { refs: [...], count: N }
 */
export function createApiRouter(store) {
  const router = Router();

  router.post('/score', upload.single('image'), scoreHandler(store));
  router.post('/preprocess', preprocessHandler(store));
  router.post('/reload', reloadHandler(store));

  // Share endpoints
  router.post('/share', shareUploadHandler());
  router.get('/share/:id', shareMetaHandler());

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', referenceCount: store.count });
  });

  return router;
}
