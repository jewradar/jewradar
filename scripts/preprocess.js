import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateEmbedding } from '../src/embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE_DIR = path.join(__dirname, '..', 'dataset');
const EMBEDDINGS_FILE = path.join(__dirname, '..', 'data', 'embeddings.json');

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const BATCH_SIZE = 5;
const DELAY_MS = 500;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function preprocessReferenceImages() {
  // Load existing progress if any
  let embeddings = [];
  const processed = new Set();
  if (fs.existsSync(EMBEDDINGS_FILE)) {
    embeddings = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'));
    for (const e of embeddings) processed.add(e.name);
    console.log(`Resuming: ${processed.size} already done`);
  }

  const files = fs.readdirSync(REFERENCE_DIR).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext) && !processed.has(f);
  });

  if (files.length === 0 && embeddings.length > 0) {
    console.log('All images already processed.');
    return embeddings.length;
  }
  if (files.length === 0) {
    throw new Error(`No images found in ${REFERENCE_DIR}`);
  }

  console.log(`Processing ${files.length} remaining images...`);

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (file) => {
        const filePath = path.join(REFERENCE_DIR, file);
        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(file).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        const embedding = await generateEmbedding(buffer, mimeType);
        return { name: file, embedding };
      })
    );

    embeddings.push(...results);
    console.log(`  ${embeddings.length} / ${embeddings.length + files.length - i - batch.length} done`);

    // Save progress after each batch
    fs.writeFileSync(EMBEDDINGS_FILE, JSON.stringify(embeddings));

    if (i + BATCH_SIZE < files.length) await sleep(DELAY_MS);
  }

  console.log(`Done. ${embeddings.length} total embeddings saved.`);
  return embeddings.length;
}

// Run directly
const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  preprocessReferenceImages().catch((err) => {
    console.error('Preprocessing failed:', err.message);
    process.exit(1);
  });
}
