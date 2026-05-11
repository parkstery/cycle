/**
 * `public/cycling_position_marker_rear.png` 로부터 짧은 루프 애니메이션 WebP 생성
 * (좌우로 살짝 기울이는 “라이딩” 느낌 — sharp join animated).
 */
import sharp from 'sharp';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const inputPath = join(root, 'public', 'cycling_position_marker_rear.png');
const outPath = join(root, 'public', 'cycling_position_marker_ride.webp');
/** CSS 스프라이트 애니(`App.tsx` 상수·`main.css` 키프레임)와 동기 */
const spriteOutPath = join(root, 'public', 'cycling_position_marker_ride_sprite.png');

/** App.tsx `SIMULATION_MARKER_SIZE_PX` 와 맞춤 */
const SIZE = 120;
const FRAME_COUNT = 16;
const FRAME_DELAY_MS = 48;
const ROCK_DEG = 5.2;

async function main() {
  const base = sharp(inputPath)
    .ensureAlpha()
    .resize(SIZE, SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

  const frameBuffers = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const t = (i / FRAME_COUNT) * Math.PI * 2;
    const deg = Math.sin(t) * ROCK_DEG;
    const buf = await base
      .clone()
      .rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      /* contain: 프레임마다 crop 이 달라지지 않게 — 스프라이트 가로 슬라이드 시 흘러가는 느낌 완화 */
      .resize(SIZE, SIZE, { fit: 'contain', position: 'centre' })
      .png()
      .toBuffer();
    frameBuffers.push(buf);
  }

  await sharp(frameBuffers, { join: { animated: true } })
    .webp({
      quality: 80,
      effort: 5,
      alphaQuality: 100,
      loop: 0,
      delay: FRAME_DELAY_MS,
    })
    .toFile(outPath);

  const compositeInputs = frameBuffers.map((buf, i) => ({
    input: buf,
    left: i * SIZE,
    top: 0,
  }));
  await sharp({
    create: {
      width: SIZE * FRAME_COUNT,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(compositeInputs)
    .png()
    .toFile(spriteOutPath);

  const meta = await sharp(outPath, { animated: true }).metadata();
  console.log('Wrote', outPath, { pages: meta.pages, width: meta.width, height: meta.pageHeight ?? meta.height });
  console.log('Wrote', spriteOutPath, { width: SIZE * FRAME_COUNT, height: SIZE, frames: FRAME_COUNT });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
