import { detectAndCropFace } from '../src/faceDetection.js';
import { generateEmbedding } from '../src/embeddings.js';
import { scoreTopK } from '../src/scoring.js';
import fs from 'fs';

function cleanup(filePath) {
  try { fs.unlinkSync(filePath); } catch {}
}

/**
 * POST /api/score
 * Upload an image → detect face → generate embedding → score via top-K neighbors.
 * Pass ?skipFace=true to skip face detection (use full image).
 */
export function scoreHandler(store) {
  return async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    if (store.refs.length === 0) {
      return res.status(400).json({ error: 'No reference embeddings. Run preprocessing first.' });
    }

    try {
      let imageBuffer;

      if (req.query.skipFace === 'true') {
        // Skip face detection, embed the full image
        imageBuffer = fs.readFileSync(req.file.path);
      } else {
        // Detect face and crop
        imageBuffer = await detectAndCropFace(req.file.path);
      }

      // Generate embedding
      const embedding = await generateEmbedding(imageBuffer);

      // Score using top-K nearest neighbors
      const result = scoreTopK(embedding, store.refs);

      cleanup(req.file.path);
      res.json(result);
    } catch (err) {
      cleanup(req.file.path);
      console.error('Score error:', err);
      const msg = err.message || 'Unknown error';
      const isNoFace = msg.includes('No face');
      const isParseError = msg.includes('Failed to parse');
      const status = (isNoFace || isParseError) ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  };
}
