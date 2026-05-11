import { RIDING_PEDAL_CELL_PX, RIDING_PEDAL_FRAME_COUNT } from './ridingPedalSpriteMeta.generated';

const STYLE_ID = 'riding-pedal-strip-keyframes';
const KF_NAME = 'cycling-marker-riding-pedal-cycle';

/** 프레임 수에 맞는 steps + keyframes 를 한 번만 주입한다. */
export function ensureRidingPedalStripKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const endPx = RIDING_PEDAL_FRAME_COUNT * RIDING_PEDAL_CELL_PX;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent =
    `@keyframes ${KF_NAME} {` +
    `from{background-position:0 0}` +
    `to{background-position:-${endPx}px 0}` +
    `}` +
    `.cycling-sim-marker-pedal-sprite{` +
    `animation-name:${KF_NAME};` +
    `animation-timing-function:steps(${RIDING_PEDAL_FRAME_COUNT},end);` +
    `animation-iteration-count:infinite;` +
    `}`;
  document.head.appendChild(el);
}
