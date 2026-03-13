const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const MOSAIC_WIDTH = 2560;
const MOSAIC_HEIGHT = 1440;
const THUMB_SIZE = 64; // each face thumbnail

async function main() {
  const datasetDir = path.join(__dirname, "..", "dataset");
  const outPath = path.join(__dirname, "..", "mosaic_2k.jpg");

  const files = fs.readdirSync(datasetDir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort();

  const cols = Math.ceil(MOSAIC_WIDTH / THUMB_SIZE);
  const rows = Math.ceil(MOSAIC_HEIGHT / THUMB_SIZE);
  const total = cols * rows;

  console.log(`Grid: ${cols}x${rows} = ${total} slots, ${files.length} images`);

  // Prepare thumbnails — cycle through dataset if needed
  const composites = [];
  for (let i = 0; i < total; i++) {
    const file = files[i % files.length];
    const x = (i % cols) * THUMB_SIZE;
    const y = Math.floor(i / cols) * THUMB_SIZE;

    const thumb = await sharp(path.join(datasetDir, file))
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
      .toBuffer();

    composites.push({ input: thumb, left: x, top: y });
  }

  // Create base canvas and composite all thumbnails
  await sharp({
    create: {
      width: MOSAIC_WIDTH,
      height: MOSAIC_HEIGHT,
      channels: 3,
      background: { r: 0, g: 56, b: 184 },
    },
  })
    .jpeg({ quality: 85 })
    .composite(composites)
    .toFile(outPath);

  console.log(`Mosaic saved to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
