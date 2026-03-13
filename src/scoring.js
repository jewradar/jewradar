import fs from 'fs';

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Score using top-K nearest neighbors.
 *
 * Compare against ALL references, take the average similarity of the
 * top K closest matches. A face that truly belongs to the group will
 * be consistently close to many references, not just one outlier.
 *
 * Then apply sigmoid to map to 1-100.
 */
export function scoreTopK(embedding, referenceEmbeddings, k = 30, midpoint = 0.722, steepness = 50) {
  const similarities = new Float64Array(referenceEmbeddings.length);

  for (let i = 0; i < referenceEmbeddings.length; i++) {
    similarities[i] = cosineSimilarity(embedding, referenceEmbeddings[i].embedding);
  }

  // Sort descending, take top K
  similarities.sort();
  const topK = similarities.subarray(similarities.length - k);

  // Average of top K similarities
  let sum = 0;
  for (let i = 0; i < topK.length; i++) sum += topK[i];
  const avgTopK = sum / topK.length;

  // Sigmoid mapping
  const sigmoid = 1 / (1 + Math.exp(-steepness * (avgTopK - midpoint)));
  const score = Math.max(1, Math.min(100, Math.round(sigmoid * 100)));

  return {
    score,
    avgTopKSimilarity: avgTopK,
    topMatch: similarities[similarities.length - 1],
  };
}

/**
 * Load reference embeddings from a JSON file.
 */
export async function loadReferenceEmbeddings(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return data;
}
