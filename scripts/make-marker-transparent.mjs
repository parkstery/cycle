/**
 * 주행 마커 PNG 배경(검정·근접 회색)을 알파로 제거한다.
 * 사용: node scripts/make-marker-transparent.mjs [public/relative/path.png]
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const rel = process.argv[2] ?? 'public/cycling_position_marker_rear.png';
const input = path.resolve(rel);
const tmp = input.replace(/\.png$/i, '.tmp.png');

function shouldBeTransparent(r, g, b) {
  const sum = r + g + b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (sum < 72) return true;
  if (sum < 115 && sat < 0.38) return true;
  return false;
}

const img = sharp(input).ensureAlpha();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
if (info.channels !== 4) {
  throw new Error(`Expected RGBA, got ${info.channels} channels`);
}
for (let i = 0; i < data.length; i += 4) {
  if (shouldBeTransparent(data[i], data[i + 1], data[i + 2])) {
    data[i + 3] = 0;
  }
}
await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .png({ compressionLevel: 9 })
  .toFile(tmp);
fs.renameSync(tmp, input);
console.log('[make-marker-transparent]', rel, `${info.width}x${info.height}`);
