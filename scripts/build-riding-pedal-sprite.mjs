/**
 * `public/riding/0512(N).png` 시퀀스를 가로 스프라이트로 합친다.
 * 출력: `public/riding/pedal-sprite.png` — App.tsx `RIDING_PEDAL_FRAME_COUNT`·`SIMULATION_MARKER_SIZE_PX` 와 동기.
 */
import fs from 'fs';
import sharp from 'sharp';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const RIDING_DIR = join(root, 'public', 'riding');
const OUT = join(RIDING_DIR, 'pedal-sprite.png');

/** App.tsx `SIMULATION_MARKER_SIZE_PX` 와 동기 */
const CELL = 120;

async function main() {
  if (!fs.existsSync(RIDING_DIR)) {
    throw new Error(`Missing directory: ${RIDING_DIR}`);
  }
  const names = fs
    .readdirSync(RIDING_DIR)
    .filter((f) => /^0512\(\d+\)\.png$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\((\d+)\)/)[1], 10);
      const nb = parseInt(b.match(/\((\d+)\)/)[1], 10);
      return na - nb;
    });

  if (names.length === 0) {
    throw new Error(`No frames matching 0512(N).png in ${RIDING_DIR}`);
  }

  const frameBuffers = [];
  for (const name of names) {
    const p = join(RIDING_DIR, name);
    const buf = await sharp(p)
      .ensureAlpha()
      .resize(CELL, CELL, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    frameBuffers.push(buf);
  }

  const n = frameBuffers.length;
  await sharp({
    create: {
      width: CELL * n,
      height: CELL,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(frameBuffers.map((buf, i) => ({ input: buf, left: i * CELL, top: 0 })))
    .png()
    .toFile(OUT);

  console.log('Wrote', OUT, { frames: n, width: CELL * n, height: CELL });
  console.log('Set App.tsx RIDING_PEDAL_FRAME_COUNT to', n, 'if it differs.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
