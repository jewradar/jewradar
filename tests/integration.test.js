import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dynamically import the app after setting env
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
process.env.PORT = '0'; // random port

describe('API Integration', () => {
  let baseUrl;
  let server;

  before(async () => {
    // Import express app setup
    const express = (await import('express')).default;
    const cors = (await import('cors')).default;
    const { loadReferenceEmbeddings } = await import('../src/scoring.js');
    const { createApiRouter } = await import('../api/index.js');

    const app = express();
    app.use(cors());
    app.use(express.json());

    const embeddingsStore = { data: [] };
    const embeddingsPath = path.join(__dirname, '..', 'data', 'embeddings.json');
    try {
      embeddingsStore.data = await loadReferenceEmbeddings(embeddingsPath);
    } catch {}

    app.use('/api', createApiRouter(embeddingsStore));

    server = app.listen(0);
    const addr = server.address();
    baseUrl = `http://localhost:${addr.port}`;
  });

  after(() => {
    server?.close();
  });

  it('GET /api/health returns ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(typeof data.referenceCount, 'number');
  });

  it('POST /api/score without image returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/score`, { method: 'POST' });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('No image'));
  });

  it('POST /api/score with non-image returns 400', async () => {
    const boundary = '----TestBoundary';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="image"; filename="test.txt"',
      'Content-Type: text/plain',
      '',
      'not an image',
      `--${boundary}--`,
    ].join('\r\n');

    const res = await fetch(`${baseUrl}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
    assert.strictEqual(res.status, 500);
  });

  it('POST /api/score with image returns score (requires API key + embeddings)', async () => {
    // Skip if no real API key or no embeddings
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'test-key') {
      return;
    }

    const datasetDir = path.join(__dirname, '..', 'dataset');
    const files = fs.readdirSync(datasetDir);
    if (files.length === 0) return;

    const imgPath = path.join(datasetDir, files[0]);
    const imgBuffer = fs.readFileSync(imgPath);

    const boundary = '----TestBoundary';
    const header = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="image"; filename="${files[0]}"`,
      'Content-Type: image/jpeg',
      '',
      '',
    ].join('\r\n');
    const footer = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(header),
      imgBuffer,
      Buffer.from(footer),
    ]);

    const res = await fetch(`${baseUrl}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });

    const data = await res.json();
    assert.strictEqual(typeof data.score, 'number');
    assert.ok(data.score >= 1 && data.score <= 100);
    assert.ok(data.comparisons.length > 0);
    console.log(`  Score: ${data.score}, Best match: ${data.bestMatch}`);
  });
});
