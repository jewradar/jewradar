import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderCard } from '../src/cardRenderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHARES_DIR = path.join(__dirname, '..', 'shares');

if (!fs.existsSync(SHARES_DIR)) {
  fs.mkdirSync(SHARES_DIR, { recursive: true });
}

// Labels lookup (same as frontend)
const LABELS = [
  { max: 15, label: 'Goyische Kopf', subtitle: 'Not a trace of the chosen people here.' },
  { max: 30, label: 'Jewish-ish', subtitle: 'A spark of Yiddishkeit, barely there.' },
  { max: 50, label: 'Honorary Member', subtitle: 'You could pass at a Shabbat dinner.' },
  { max: 70, label: 'Certified Jew', subtitle: 'Mazel tov! The resemblance is real.' },
  { max: 85, label: 'Ultra Jew', subtitle: 'You could walk into any synagogue and belong.', hebrew: 'יהודי אמיתי' },
  { max: 99, label: 'Maximum Jew', subtitle: 'Peak Jewish energy radiates from your face.', hebrew: 'סופר ג׳ו' },
  { max: 100, label: 'JEWRADAR', subtitle: 'The algorithm has spoken. You are the one.', hebrew: 'מלך היהודים' },
];

function getLabel(pct) {
  for (const l of LABELS) {
    if (pct <= l.max) return l;
  }
  return LABELS[LABELS.length - 1];
}

/**
 * POST /api/share
 * Accepts user photo (base64) + percentage. Renders card server-side.
 * Body: { photo: "data:image/...;base64,...", percentage: number }
 */
export function shareUploadHandler() {
  return async (req, res) => {
    try {
      const { photo, percentage } = req.body;

      if (percentage == null || !photo) {
        return res.status(400).json({ error: 'Missing required fields: photo, percentage' });
      }

      // Decode photo
      const base64Match = photo.match(/^data:image\/\w+;base64,(.+)$/);
      if (!base64Match) {
        return res.status(400).json({ error: 'Invalid photo format' });
      }
      const photoBuffer = Buffer.from(base64Match[1], 'base64');

      // Get label info
      const labelInfo = getLabel(percentage);

      // Render card
      const cardPng = await renderCard(photoBuffer, {
        percentage,
        label: labelInfo.label,
        subtitle: labelInfo.subtitle,
        hebrew: labelInfo.hebrew,
      });

      // Save
      const id = randomBytes(6).toString('hex');
      const imgPath = path.join(SHARES_DIR, `${id}.png`);
      const metaPath = path.join(SHARES_DIR, `${id}.json`);

      fs.writeFileSync(imgPath, cardPng);
      fs.writeFileSync(metaPath, JSON.stringify({
        id,
        percentage,
        label: labelInfo.label,
        hasImage: true,
        createdAt: new Date().toISOString(),
      }));

      res.json({ id });
    } catch (err) {
      console.error('Share creation failed:', err);
      res.status(500).json({ error: 'Failed to create share' });
    }
  };
}

/**
 * GET /api/share/:id
 */
export function shareMetaHandler() {
  return (req, res) => {
    const { id } = req.params;
    if (!/^[a-f0-9]{12}$/.test(id)) {
      return res.status(400).json({ error: 'Invalid share ID' });
    }
    const metaPath = path.join(SHARES_DIR, `${id}.json`);
    if (!fs.existsSync(metaPath)) {
      return res.status(404).json({ error: 'Share not found' });
    }
    res.json(JSON.parse(fs.readFileSync(metaPath, 'utf-8')));
  };
}
