import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadReferenceEmbeddings } from './src/scoring.js';
import { createApiRouter } from './api/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Store all reference embeddings in memory for top-K comparison
const store = { refs: [], count: 0 };

try {
  store.refs = await loadReferenceEmbeddings(
    path.join(__dirname, 'data', 'embeddings.json')
  );
  store.count = store.refs.length;
  console.log(`Loaded ${store.count} reference embeddings`);
} catch {
  console.warn('No reference embeddings found. Run "npm run preprocess" first.');
}

// Serve static images (dataset faces + mosaic)
app.use('/api/images/dataset', express.static(path.join(__dirname, 'dataset')));
app.use('/api/images', express.static(__dirname, {
  extensions: ['jpg', 'png'],
  index: false,
}));

// Serve shared card images
app.use('/api/shares', express.static(path.join(__dirname, 'shares'), {
  extensions: ['png'],
  index: false,
}));

app.use('/api', createApiRouter(store));

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
