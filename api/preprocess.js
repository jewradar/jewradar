import path from 'path';
import { fileURLToPath } from 'url';
import { loadReferenceEmbeddings } from '../src/scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const embeddingsPath = path.join(__dirname, '..', 'data', 'embeddings.json');

export function preprocessHandler(store) {
  return async (_req, res) => {
    try {
      const { preprocessReferenceImages } = await import('../scripts/preprocess.js');
      const count = await preprocessReferenceImages();
      store.refs = await loadReferenceEmbeddings(embeddingsPath);
      store.count = store.refs.length;
      res.json({ message: `Processed ${count} images`, count });
    } catch (err) {
      console.error('Preprocess error:', err);
      res.status(500).json({ error: err.message });
    }
  };
}

export function reloadHandler(store) {
  return async (_req, res) => {
    try {
      store.refs = await loadReferenceEmbeddings(embeddingsPath);
      store.count = store.refs.length;
      res.json({ message: `Loaded ${store.refs.length} reference embeddings` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}
