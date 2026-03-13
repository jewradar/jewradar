# JewRadar

Upload a photo. Get a score from 1 to 100 estimating how Jewish you look — powered by multimodal AI embeddings and a reference dataset of 1,691 face images.

## Why

Multimodal embeddings are one of the most underappreciated capabilities in modern AI. Models like Google's Gemini Embedding can map images into a shared vector space, learning to recognize patterns that are nearly impossible to describe visually but trivially detectable in high-dimensional space.

The problem is that big AI providers have buried this power under layers of guardrails. Their models are over-censored and allergic to anything outside a narrow band of approved outputs. You can't explore edge cases, push boundaries, or get a straight answer.

Embeddings offer a way out. You get the representational power of a frontier model — billions of parameters, world knowledge, cross-modal understanding — but in a form you actually own. Extract the embeddings, build your own scoring on top, no content policy standing between you and your application.

This project is a proof of concept. Something catchy enough to grab attention and fun enough to share — but underneath, a demonstration of what multimodal embeddings can do when you let them off the leash. The big models are incredible. Their corporate wrappers are not. Embeddings let you keep the former and ditch the latter.

## Technical Approach

### Embedding Generation

We use Google's **Gemini Embedding 2** (`gemini-embedding-2-preview`) — a multimodal embedding model that produces 3072-dimensional vectors from images. Each reference face image in the dataset is pre-processed into an embedding and stored as JSON.

### Face Detection

When a user uploads a photo, the face is detected and cropped using **Gemini 2.5 Flash** vision model. The model returns bounding box coordinates as JSON, then `sharp` crops the face region with padding. This isolates the face from background noise before embedding.

Face detection can be skipped with `?skipFace=true` if the uploaded image is already a face crop.

### Scoring Algorithm: Top-K Nearest Neighbors + Sigmoid

Comparing a single embedding against a centroid (average) of the reference set dilutes the signal — the average of many diverse faces becomes generic. Comparing against every reference individually inflates scores — with enough references, any face will find a close match.

Instead, we use **top-K nearest neighbors**:

1. Compute cosine similarity between the uploaded face and **all** reference embeddings
2. Take the **top K** (default 30) highest similarities
3. Average them — this is the **avgTopK** score

A face that genuinely belongs to the reference group will be consistently similar to many references (high avgTopK). An outsider might match 1–2 by chance but won't sustain it across 30.

The raw avgTopK is then mapped to a 1–100 score using a **sigmoid function**:

```
score = 1 / (1 + e^(-steepness × (avgTopK - midpoint)))
```

Parameters (calibrated against test data):
- `midpoint = 0.722` — the avgTopK value that maps to score 50
- `steepness = 200` — controls how sharp the transition is

This creates a steep S-curve where small differences in similarity produce large score differences, giving clean separation between matches and non-matches.

### Performance

- **1691 reference embeddings** loaded into memory at startup (~64MB)
- Scoring is pure CPU math — cosine similarity across all references takes <50ms
- The bottleneck is the Gemini API calls (face detection + embedding generation), ~2-4s total per request

## Project Structure

```
├── server.js                 # Express server, loads embeddings, mounts routes
├── api/
│   ├── index.js              # Router setup, multer config
│   ├── score.js              # POST /api/score — upload → detect → embed → score
│   └── preprocess.js         # POST /api/preprocess, POST /api/reload
├── src/
│   ├── embeddings.js         # Gemini embedding generation (with retry)
│   ├── faceDetection.js      # Face detection via Gemini Flash + sharp crop
│   └── scoring.js            # Top-K scoring + sigmoid mapping
├── scripts/
│   └── preprocess.js         # Batch embed all reference images → embeddings.json
├── dataloader/               # Dataset scraping & loading utilities
├── dataset/                  # Reference face images (not committed)
├── data/
│   └── embeddings.json       # Pre-computed embeddings (generated, not committed)
├── tests/
│   ├── scoring.test.js       # Unit tests for scoring logic
│   └── integration.test.js   # API integration tests
└── .env.example              # Environment variable template
```

## Setup

```bash
npm install

# Configure
cp .env.example .env
# Add your GEMINI_API_KEY to .env

# Extract the reference dataset
tar xzf dataset.tar.gz

# Generate embeddings (runs batch Gemini API calls, supports resume)
npm run preprocess

# Start server
npm start
```

## API

### `POST /api/score`

Upload a face image, get a similarity score.

```bash
curl -X POST http://localhost:3005/api/score \
  -F "image=@photo.jpg"
```

Query params:
- `skipFace=true` — skip face detection, embed the full image directly

Response:
```json
{
  "score": 81,
  "avgTopKSimilarity": 0.729,
  "topMatch": 0.775
}
```

### `POST /api/preprocess`

Re-generate embeddings for all images in `dataset/`.

### `POST /api/reload`

Reload embeddings from `data/embeddings.json` without re-generating.

### `GET /api/health`

```json
{ "status": "ok", "referenceCount": 1691 }
```

## Testing

```bash
npm test
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google AI Studio API key |
| `PORT` | Server port (default: 3005) |
