/**
 * 미리 생성한 음성 파일 재생 + 메모리 캐시.
 * - 문구 텍스트 → phrase key → 오디오 파일 URL → 재생.
 * - 테스트 방법론 Phase 3~4에서 사용.
 */

import {
  textToPhraseKey,
  getCoachingPhrases,
  getResistancePhrases,
} from "./phraseManifest";

/** 오디오 파일 기본 경로: services/choaching → 배포 시 public/choaching (dist/choaching) */
const DEFAULT_BASE_URL = "/choaching/";
const DEFAULT_EXT = ".mp3";

export type AudioCacheOptions = {
  baseUrl?: string;
  ext?: string;
};

const cache = new Map<string, HTMLAudioElement>();
let options: Required<AudioCacheOptions> = {
  baseUrl: DEFAULT_BASE_URL,
  ext: DEFAULT_EXT,
};

export function configureAudioCache(opts: AudioCacheOptions): void {
  options = { ...options, ...opts };
}

function getAudioUrl(id: string): string {
  const base = options.baseUrl.replace(/\/?$/, "/");
  return `${base}${id}${options.ext}`;
}

/** 캐시에 오디오 로드. 실패 시 null */
function loadToCache(id: string): Promise<HTMLAudioElement | null> {
  return new Promise((resolve) => {
    const url = getAudioUrl(id);
    const audio = new Audio(url);
    const onDone = () => {
      audio.removeEventListener("canplaythrough", onDone);
      audio.removeEventListener("error", onError);
      cache.set(id, audio);
      resolve(audio);
    };
    const onError = () => {
      audio.removeEventListener("canplaythrough", onDone);
      audio.removeEventListener("error", onError);
      resolve(null);
    };
    audio.addEventListener("canplaythrough", onDone, { once: true });
    audio.addEventListener("error", onError, { once: true });
    audio.load();
  });
}

/** 현재 재생 중인 오디오 (한 번에 하나만 재생 정책) */
let currentPlayback: HTMLAudioElement | null = null;

function stopCurrent(): void {
  if (currentPlayback) {
    currentPlayback.pause();
    currentPlayback.currentTime = 0;
    currentPlayback = null;
  }
}

/**
 * 문구 텍스트로 미리 생성된 음성 파일 재생.
 * - 키가 있으면 해당 파일 재생(캐시 hit 또는 로드 후 재생).
 * - 키가 없거나 파일 로드 실패 시 재생하지 않음.
 */
export async function playPhrase(
  text: string,
  _lang?: string
): Promise<{ played: boolean; key: string | null; fallback: boolean }> {
  stopCurrent();
  const key = textToPhraseKey(text);
  if (!key) {
    return { played: false, key: null, fallback: true };
  }
  let audio: HTMLAudioElement | null = cache.get(key) ?? null;
  if (!audio) {
    audio = await loadToCache(key);
  }
  if (!audio) {
    return { played: false, key, fallback: true };
  }
  currentPlayback = audio;
  audio.currentTime = 0;
  const played = await new Promise<boolean>((resolve) => {
    audio!.addEventListener("ended", () => {
      currentPlayback = null;
      resolve(true);
    }, { once: true });
    audio!.addEventListener("error", () => {
      currentPlayback = null;
      resolve(false);
    }, { once: true });
    audio!.play().catch(() => resolve(false));
  });
  return { played, key, fallback: false };
}

/** 재생 중지 */
export function stopPhrase(): void {
  stopCurrent();
}

/**
 * 코칭 멘트 → 저항 멘트 순차 재생 (분리 파일 방식).
 * tip_X.mp3 재생 후 끝나면 res_Y.mp3 재생. 실행 과정에서 문제 없음.
 */
export async function playCoachingThenResistance(
  tipId: string,
  resId: string,
  lang?: string
): Promise<{ coachingPlayed: boolean; resistancePlayed: boolean; fallback: boolean }> {
  stopCurrent();
  const coachingText =
    getCoachingPhrases().find((p) => p.id === tipId)?.text ?? "";
  const resistanceText =
    getResistancePhrases().find((p) => p.id === resId)?.text ?? "";

  const playOne = async (
    id: string,
    _text: string
  ): Promise<HTMLAudioElement | null> => {
    let audio: HTMLAudioElement | null = cache.get(id) ?? null;
    if (!audio) audio = await loadToCache(id);
    if (!audio) return null;
    currentPlayback = audio;
    audio.currentTime = 0;
    return new Promise<HTMLAudioElement | null>((resolve) => {
      audio!.addEventListener("ended", () => {
        currentPlayback = null;
        resolve(audio);
      }, { once: true });
      audio!.addEventListener("error", () => {
        currentPlayback = null;
        resolve(null);
      }, { once: true });
      audio!.play().catch(() => resolve(null));
    });
  };

  const coachingPlayed = await playOne(tipId, coachingText);
  const resistancePlayed = await playOne(resId, resistanceText);

  return {
    coachingPlayed: !!coachingPlayed,
    resistancePlayed: !!resistancePlayed,
    fallback: !coachingPlayed || !resistancePlayed,
  };
}

/** 캐시된 키 개수 (테스트 Phase 3용) */
export function getCacheSize(): number {
  return cache.size;
}

/** 캐시 비우기 (테스트용) */
export function clearCache(): void {
  stopCurrent();
  cache.clear();
}
