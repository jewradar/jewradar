import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, '..', 'assets');

const W = 800;
const H = 1000;

function getAccentColor(pct) {
  if (pct <= 30) return '#ef4444';
  if (pct >= 70) return '#4ade80';
  return '#c5a236';
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Render a share card image.
 * @param {Buffer} photoBuffer - The user's photo as a buffer
 * @param {{ percentage: number, label: string, subtitle: string, hebrew?: string }} result
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function renderCard(photoBuffer, result) {
  const { percentage, label, subtitle, hebrew } = result;
  const accent = getAccentColor(percentage);

  // 1. Background: load and cover-fit
  const bgPath = path.join(ASSETS, 'card_cover_mascot.png');
  const bg = await sharp(bgPath)
    .resize(W, H, { fit: 'cover', position: 'center' })
    .toBuffer();

  // 2. Dark overlay
  const overlay = Buffer.from(
    `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="rgba(0,0,0,0.50)"/></svg>`
  );

  // 3. User photo: resize to 280x280 circle
  const photoSize = 280;
  const photoResized = await sharp(photoBuffer)
    .resize(photoSize, photoSize, { fit: 'cover', position: 'center' })
    .toBuffer();

  // Create circular mask
  const circleMask = Buffer.from(
    `<svg width="${photoSize}" height="${photoSize}">
      <circle cx="${photoSize / 2}" cy="${photoSize / 2}" r="${photoSize / 2}" fill="white"/>
    </svg>`
  );

  const circularPhoto = await sharp(photoResized)
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Photo glow ring
  const glowRing = Buffer.from(
    `<svg width="${photoSize + 20}" height="${photoSize + 20}">
      <circle cx="${(photoSize + 20) / 2}" cy="${(photoSize + 20) / 2}" r="${photoSize / 2 + 4}"
        fill="none" stroke="${accent}" stroke-width="4" opacity="0.6"/>
    </svg>`
  );

  // 4. Mascot watermark
  const mascotPath = path.join(ASSETS, 'mascot.png');
  const mascot = await sharp(mascotPath)
    .resize(56, 56, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .modulate({ brightness: 1 })
    .toBuffer();

  // 5. Text overlay (SVG)
  const hebrewLine = hebrew
    ? `<text x="${W / 2}" y="720" text-anchor="middle"
         font-family="serif" font-size="48" fill="${accent}" opacity="0.9">${escapeXml(hebrew)}</text>`
    : '';
  const subtitleY = hebrew ? 780 : 720;

  // Word-wrap subtitle (rough: split if > ~40 chars)
  const subtitleLines = [];
  const words = subtitle.split(' ');
  let currentLine = '';
  for (const word of words) {
    const test = currentLine ? currentLine + ' ' + word : word;
    if (test.length > 45 && currentLine) {
      subtitleLines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) subtitleLines.push(currentLine);

  const subtitleSvg = subtitleLines
    .map((ln, i) =>
      `<text x="${W / 2}" y="${subtitleY + i * 32}" text-anchor="middle"
         font-family="sans-serif" font-size="24" fill="rgba(255,255,255,0.85)">${escapeXml(ln)}</text>`
    )
    .join('');

  const textSvg = Buffer.from(
    `<svg width="${W}" height="${H}">
      <style>
        @font-face {
          font-family: 'Bungee';
          src: url('file://${path.join(ASSETS, 'fonts', 'Bungee-Regular.ttf')}');
        }
      </style>
      <!-- Title -->
      <text x="${W / 2}" y="100" text-anchor="middle"
        font-family="Bungee, Impact, sans-serif" font-size="48" font-weight="bold"
        fill="white" letter-spacing="6">JEWRADAR.FUN</text>

      <!-- Percentage -->
      <text x="${W / 2}" y="600" text-anchor="middle"
        font-family="Bungee, Impact, sans-serif" font-size="120" font-weight="bold"
        fill="${accent}">${percentage}%</text>

      <!-- Label -->
      <text x="${W / 2}" y="660" text-anchor="middle"
        font-family="Bungee, Impact, sans-serif" font-size="42" font-weight="bold"
        fill="white">${escapeXml(label)}</text>

      <!-- Hebrew -->
      ${hebrewLine}

      <!-- Subtitle -->
      ${subtitleSvg}
    </svg>`
  );

  // 6. Compose everything
  const photoLeft = Math.round((W - photoSize) / 2);
  const photoTop = 200;
  const glowLeft = photoLeft - 10;
  const glowTop = photoTop - 10;

  const result_img = await sharp(bg)
    .composite([
      { input: overlay, blend: 'over' },
      { input: glowRing, top: glowTop, left: glowLeft, blend: 'over' },
      { input: circularPhoto, top: photoTop, left: photoLeft, blend: 'over' },
      { input: textSvg, blend: 'over' },
      { input: mascot, top: H - 80, left: W - 80, blend: 'over' },
    ])
    .png()
    .toBuffer();

  return result_img;
}
