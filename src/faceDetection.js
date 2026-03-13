import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import fs from 'fs';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const FACE_DETECT_PROMPT = `Detect the most prominent face in this image.
Return ONLY a JSON object with the face bounding box as fractions of image dimensions (values between 0 and 1):
{"found": true, "x": 0.1, "y": 0.1, "width": 0.3, "height": 0.4}
where x,y is the top-left corner of the face bounding box.
If no face is found, return {"found": false}.`;

/**
 * Detect a face in the image and return a cropped buffer of just the face.
 * Uses Gemini Vision for face detection and sharp for cropping.
 */
export async function detectAndCropFace(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const metadata = await sharp(imageBuffer).metadata();
  const base64 = imageBuffer.toString('base64');
  const mimeType = metadata.format === 'png' ? 'image/png' : 'image/jpeg';

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        inlineData: { mimeType, data: base64 },
      },
      FACE_DETECT_PROMPT,
    ],
    config: {
      responseMimeType: 'application/json',
    },
  });

  let faceData;
  try {
    faceData = JSON.parse(response.text);
  } catch {
    throw new Error('Failed to parse face detection response');
  }

  if (!faceData.found) {
    throw new Error('No face detected in the uploaded image');
  }

  // Add padding around the detected face
  const padding = 0.15;
  const left = Math.max(0, Math.round((faceData.x - padding) * metadata.width));
  const top = Math.max(0, Math.round((faceData.y - padding) * metadata.height));
  const width = Math.min(
    Math.round((faceData.width + padding * 2) * metadata.width),
    metadata.width - left
  );
  const height = Math.min(
    Math.round((faceData.height + padding * 2) * metadata.height),
    metadata.height - top
  );

  const croppedBuffer = await sharp(imageBuffer)
    .extract({ left, top, width, height })
    .jpeg({ quality: 90 })
    .toBuffer();

  return croppedBuffer;
}
