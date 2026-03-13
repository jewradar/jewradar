import { describe, it } from 'node:test';
import assert from 'node:assert';
import { computeCentroid, scoreAgainstCentroid } from '../src/scoring.js';

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

describe('computeCentroid', () => {
  it('averages embeddings correctly', () => {
    const refs = [
      { name: 'a.jpg', embedding: [1, 0, 0] },
      { name: 'b.jpg', embedding: [0, 1, 0] },
      { name: 'c.jpg', embedding: [0, 0, 1] },
    ];
    const centroid = computeCentroid(refs);
    const expected = 1 / 3;
    assert.ok(Math.abs(centroid[0] - expected) < 0.0001);
    assert.ok(Math.abs(centroid[1] - expected) < 0.0001);
    assert.ok(Math.abs(centroid[2] - expected) < 0.0001);
  });

  it('returns same vector for single reference', () => {
    const refs = [{ name: 'a.jpg', embedding: [0.5, 0.3, 0.8] }];
    const centroid = computeCentroid(refs);
    assert.deepStrictEqual(centroid, [0.5, 0.3, 0.8]);
  });
});

describe('scoreAgainstCentroid', () => {
  it('returns 100 for embedding identical to centroid', () => {
    const centroid = [1, 0, 0];
    const result = scoreAgainstCentroid([1, 0, 0], centroid);
    assert.strictEqual(result.score, 100);
    assert.ok(result.similarity > 0.99);
  });

  it('returns 1 for embedding orthogonal to centroid', () => {
    const centroid = [1, 0, 0];
    const result = scoreAgainstCentroid([0, 1, 0], centroid);
    assert.strictEqual(result.score, 1);
  });

  it('returns 1 for opposite embedding', () => {
    const centroid = [1, 0, 0];
    const result = scoreAgainstCentroid([-1, 0, 0], centroid);
    assert.strictEqual(result.score, 1);
  });

  it('sigmoid: similarity above midpoint scores high', () => {
    // sim=0.85 with midpoint=0.80 → should be ~95
    const centroid = [1, 0.1];
    const sim = cosineSim([1, 0.1], centroid); // ~1.0
    const result = scoreAgainstCentroid(centroid, centroid);
    assert.strictEqual(result.score, 100);
  });

  it('sigmoid: similarity below midpoint scores low', () => {
    const centroid = [1, 0, 0];
    const result = scoreAgainstCentroid([0, 1, 0], centroid);
    assert.strictEqual(result.score, 1);
  });
});
