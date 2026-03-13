import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MAX_RETRIES = 3;
const RETRY_DELAY = 3000;

/**
 * Generate an embedding vector for an image buffer using Gemini.
 */
export async function generateEmbedding(imageBuffer, mimeType = 'image/jpeg') {
  const base64 = imageBuffer.toString('base64');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: [
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
        ],
      });

      return result.embeddings[0].values;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      const delay = RETRY_DELAY * attempt;
      console.warn(`  Retry ${attempt}/${MAX_RETRIES} after ${delay}ms: ${err.message?.slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
