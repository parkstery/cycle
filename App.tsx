
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Navigation, Play, Pause, RotateCcw, Trash2, X, MapPin, Target, Volume2, AreaChart as AreaChartIcon, ChevronRight, ChevronLeft, ChevronsLeft, ChevronDown, History, Route as RouteIcon, Zap, Activity, ShieldAlert, Bike, Footprints, Car, Maximize2, Minimize2, Waypoints, ArrowUpDown, Plus, Minus, CheckCircle2, Layers, Star, Square, Mic, Music, Menu, MessageSquare, Gauge, Bluetooth } from 'lucide-react';
import ElevationChartView from './ElevationChartView';
import About from './About';
import MenuPanel from './MenuPanel';
import { RouteInfo, TravelMode, SimulationState, CoachingData, SavedRoute, PanoDataItem, AppPhase, CachedCoachingItem, SavedRoutePayload } from './types';
import { getAdvancedCoaching, getPredictiveCoaching, getCourseBriefing, getRideEncouragement, pickFreshTipForResistance, parseResistanceBand } from './services/aiCoach';
import * as nominatim from './services/nominatim';
import type { SearchSuggestionItem } from './services/nominatim';
import * as openElevation from './services/openElevation';
import { applyRoadElevationModel } from './services/roadElevation';
import { getValhallaElevationAlongOsrmPath, isValhallaElevationConfigured } from './services/valhallaElevation';
import { fetchOsrmRouteJson } from './services/osrmRoute';
import { Capacitor, SystemBars, SystemBarType } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { AdMob, RewardAdOptions, AdMobRewardItem, InterstitialAdPluginEvents } from '@capacitor-community/admob';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { decodePath, computeDistanceBetween, computeHeading, computeOffset } from './services/geoUtils';
import { SensorsModal } from './SensorsModal';
import { BikeProfileModal } from './BikeProfileModal';
import { getIndoorBleHub } from './sensor/indoorBleHub';
import { createDualMergeState, pickRpmForIntensity, maybeUpdateWheelCadenceK } from './sensor/dualMerge';
import { decideSpeed, createSpeedFilterState, presetCapacityRpm } from './sensor/effortModel';
import type { SpeedSource, SpeedFilterState } from './sensor/effortModel';
import { loadIndoorSensorPrefs, saveIndoorSensorPrefs, clampFeelK, FEEL_K_MIN, FEEL_K_MAX, FEEL_K_STEP } from './sensor/sensorPrefs';
import type { BikeProfile } from './sensor/sensorPrefs';
import { logEvent } from "firebase/analytics";
import { analytics } from './firebase';
logEvent(analytics, "app_open");
logEvent(analytics, "test_event");

declare var google: any;
const FAVORITE_ROUTES_STORAGE_KEY = 'favorite_routes';
const FAVORITE_ROUTES_INIT_VERSION_KEY = 'favorite_routes_init_version';
const BUNDLED_MY_ROUTES_VERSION = 2;

/** 피처 플래그: 저장된 경로를 OSRM/Elevation 재호출 없이 오프라인 복원. 문제 발생 시 false 로 내려 기존(재탐색) 동작으로 폴백. */
const USE_OFFLINE_ROUTE_RESTORE = true;

/** 저장 payload 의 현재 스키마 버전. */
const SAVED_ROUTE_PAYLOAD_VERSION = 2 as const;

/** densifiedGeometry 간격(m). calculateRoute 의 segmentLength 와 동일해야 한다. */
const ROUTE_DENSIFY_INTERVAL_M = 10;

/** 메뉴·URL과 연동되는 표고 엔진 선택값 (localStorage). */
const ELEVATION_ENGINE_STORAGE_KEY = 'cycle_elevation_engine';
const DEFAULT_ROUTE_ASSET_PATHS = [
  'my-routes/default-slot-1.json',
  'my-routes/default-slot-2.json',
  'my-routes/default-slot-3.json',
  'my-routes/default-slot-4.json',
  'my-routes/default-slot-5.json'
] as const;

const parseSavedRoutes = (raw: string | null): SavedRoute[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: any) => item && typeof item.origin === 'string' && typeof item.destination === 'string');
  } catch {
    return [];
  }
};

/** [lat,lng] 배열을 densify 간격(기본 10m)으로 보간 (calculateRoute 의 densifiedPath 와 동일 로직) */
const densifyLatLngPath = (
  latLngs: [number, number][],
  intervalM: number = ROUTE_DENSIFY_INTERVAL_M
): [number, number][] => {
  if (latLngs.length < 2) return latLngs.slice();
  const out: [number, number][] = [];
  for (let i = 0; i < latLngs.length - 1; i++) {
    const p1 = latLngs[i];
    const p2 = latLngs[i + 1];
    out.push(p1);
    const a = { lat: p1[0], lng: p1[1] };
    const b = { lat: p2[0], lng: p2[1] };
    const dist = computeDistanceBetween(a, b);
    if (dist > intervalM) {
      const steps = Math.floor(dist / intervalM);
      const heading = computeHeading(a, b);
      for (let j = 1; j <= steps; j++) {
        const pt = computeOffset(a, j * intervalM, heading);
        out.push([pt.lat, pt.lng]);
      }
    }
  }
  out.push(latLngs[latLngs.length - 1]);
  return out;
};

/** 누적 거리 배열 계산 (미터) */
const computeCumulativeDistances = (latLngs: [number, number][]): number[] => {
  const cum: number[] = new Array(latLngs.length);
  cum[0] = 0;
  for (let i = 1; i < latLngs.length; i++) {
    const a = { lat: latLngs[i - 1][0], lng: latLngs[i - 1][1] };
    const b = { lat: latLngs[i][0], lng: latLngs[i][1] };
    cum[i] = cum[i - 1] + computeDistanceBetween(a, b);
  }
  return cum;
};

/** payload 가 v2 오프라인 복원에 필요한 모든 필드를 갖췄는지 검증 */
const isOfflineRestorablePayload = (payload: SavedRoutePayload | undefined): boolean => {
  if (!payload) return false;
  if (payload.schemaVersion !== SAVED_ROUTE_PAYLOAD_VERSION) return false;
  if (!Array.isArray(payload.densifiedGeometry) || payload.densifiedGeometry.length < 2) return false;
  if (!Array.isArray(payload.cumulativeDistances) || payload.cumulativeDistances.length !== payload.densifiedGeometry.length) return false;
  return true;
};

/** 숫자 소수점 정밀도 고정 (저장용) */
const fix8 = (n: number): number => Number(Number(n).toFixed(8));
const COORDINATE_LABEL_REGEX = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/;
/** 상단 장소 검색 자동완성 (Nominatim 제한·디바운스) */
const PLACE_SEARCH_SUGGEST_LIMIT = 8;
const PLACE_SEARCH_DEBOUNCE_MS = 350;
const MAP_PICK_FALLBACK_ADDRESS = '인근 주소 탐색 중';
const MAP_PICK_GENERIC_ADDRESS = '대한민국 인근';
const isCoordinateLabel = (text: string | undefined | null): boolean =>
  !!text && COORDINATE_LABEL_REGEX.test(text.trim());
const isPendingMapAddress = (text: string | undefined | null): boolean =>
  !text ||
  text === 'Loading...' ||
  text === MAP_PICK_FALLBACK_ADDRESS ||
  text === MAP_PICK_GENERIC_ADDRESS ||
  isCoordinateLabel(text);
const toHumanAddress = (text: string | undefined | null): string =>
  isPendingMapAddress(text) ? MAP_PICK_FALLBACK_ADDRESS : (text as string).trim();
const toLatLngPair = (p: any): [number, number] => {
  const lat = typeof p?.lat === 'function' ? p.lat() : p?.lat;
  const lng = typeof p?.lng === 'function' ? p.lng() : p?.lng;
  return [fix8(lat), fix8(lng)];
};

const modeFromProfile = (profile: 'cycling' | 'driving' | 'foot'): TravelMode => (
  profile === 'driving' ? TravelMode.DRIVING : profile === 'cycling' ? TravelMode.BICYCLING : TravelMode.WALKING
);

const profileFromMode = (targetMode: TravelMode): SavedRoutePayload['profile'] => (
  targetMode === TravelMode.DRIVING ? 'driving' : targetMode === TravelMode.BICYCLING ? 'cycling' : 'foot'
);

const hydrateBundledRoute = (route: SavedRoute, idx: number, now: number): SavedRoute => ({
  ...route,
  id: route.id || `default-slot-${idx + 1}`,
  source: 'DEFAULT',
  bundledId: route.bundledId || `default-slot-${idx + 1}`,
  timestamp: now - idx
});

const loadBundledDefaultRoutes = async (): Promise<SavedRoute[]> => {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  const now = Date.now();
  const loaded = await Promise.all(
    DEFAULT_ROUTE_ASSET_PATHS.map(async (assetPath, idx) => {
      const response = await fetch(`${base}${assetPath}`);
      if (!response.ok) throw new Error(`Failed to load ${assetPath}`);
      const json = await response.json();
      return hydrateBundledRoute(json as SavedRoute, idx, now);
    })
  );
  return loaded;
};

// 자동배포문제....
// 거리뷰 버튼 아이콘 (Show Streetview Coverage) — base path 대응
const STREETVIEW_ICON = `${(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')}cycle_road.png`;

// AdMob Units (Ride the World)..
const ADMOB_INTERSTITIAL_AD_UNIT_ID = 'ca-app-pub-2386721030013396/3841473087';
// Rewarded video ad (replace with production ad unit when ready)
const ADMOB_REWARD_VIDEO_AD_UNIT_ID = 'ca-app-pub-2386721030013396/9109144037';

// Ride distance policy
const DEFAULT_RIDE_LIMIT_KM = 5;
const MAX_RIDE_LIMIT_KM = 50;
const DEFAULT_RIDE_LIMIT_M = DEFAULT_RIDE_LIMIT_KM * 1000;
const MAX_RIDE_LIMIT_M = MAX_RIDE_LIMIT_KM * 1000;
const SECOND_REWARD_OFFER_BEFORE_M = 300; // show second offer around 4.7km

/** Android: 루트에서 두 번째 뒤로가기로 종료까지 허용 시간(ms) */
const ANDROID_EXIT_DOUBLE_BACK_MS = 2000;

/**
 * Android native immersive: 상태바 영역을 컨트롤이 사용하도록 top inset을 0으로 둔다.
 * (상단 스와이프 시 상태바는 transient로 잠깐 노출)
 */
const IS_ANDROID_NATIVE = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const SAFE_TOP_INSET = IS_ANDROID_NATIVE ? '0px' : 'env(safe-area-inset-top, 0px)';
/** 네이티브 WebView 패딩 없음 — safe-area는 CSS env()만 사용 (viewport-fit=cover) */
const SAFE_TOP_1REM = `calc(${SAFE_TOP_INSET} + 1rem)`;
const SAFE_TOP_4_25REM = `calc(${SAFE_TOP_INSET} + 4.25rem)`;
const SAFE_TOP_SPEED_PANEL = `calc(${SAFE_TOP_INSET} + 1rem + 2.4rem + 0.5rem)`;
const SAFE_LEFT_1REM = 'calc(env(safe-area-inset-left, 0px) + 1rem)';
const SAFE_RIGHT_1REM = 'calc(env(safe-area-inset-right, 0px) + 1rem)';
const SAFE_BOTTOM_25 = 'calc(25px + env(safe-area-inset-bottom, 0px))';
const SAFE_BOTTOM_EXIT_TOAST = 'calc(6rem + env(safe-area-inset-bottom, 0px))';

const PLAYLIST = [
  "https://www.dropbox.com/scl/fi/0faz2sk5p3sa3faodppc9/___-Remastered.mp3?rlkey=t0tiqm3po5ktfpqodby8665hw&st=3i57ybqu&dl=1",
  "https://www.dropbox.com/scl/fi/41z8m3j4oamnay0h1ko2q/.mp3?rlkey=sa31hghtq0vg3tdxdkis5cvx4&st=tv5kecjg&dl=1",
  "https://www.dropbox.com/scl/fi/k976v42zddy340k2wu7fm/Remastered-1.mp3?rlkey=mxg7f8oyw62xyq16p4jw419yh&st=woegl8g9&dl=1", 
  "https://www.dropbox.com/scl/fi/5oseee6wc35asvchg0m7f/Remastered.mp3?rlkey=c82cv94wq00jj8o5ohyr6zcik&st=cmk2189q&dl=1",  
  "https://www.dropbox.com/scl/fi/xmstjc33yractfy18k7g1/Brushing-Teeth-in-the-Morning.mp3?rlkey=0ie50ur6z2hr1t3cekreokqbm&st=lmn7p261&dl=1",
  "https://www.dropbox.com/scl/fi/tc0qkixfvj4rq2ulwtcw4/Fast-Recorder-Play.mp3?rlkey=7xp82nfkd0df16cj4l7e6vc95&st=bkuxlebh&dl=1",
  "https://www.dropbox.com/scl/fi/essqj2xo5fflpqg8vky2d/Hyperdrive-Circuit.mp3?rlkey=14v0r13v9z6uvcjo0vcjmpmk5&st=nnq8e6fh&dl=1",
  "https://www.dropbox.com/scl/fi/if7c1yzc9uviz415sz7jw/Let-s-Go-on-a-Trip-1.mp3?rlkey=uduy9c77kdgllj4o6jh9azh2v&st=4opmjfqc&dl=1",
  "https://www.dropbox.com/scl/fi/tpoiae5vy3pdoeagjq6b9/Let-s-Have-a-Blast.mp3?rlkey=wi50njh9e7w7x46zkh53ksr72&st=7zhyvib0&dl=1",
  "https://www.dropbox.com/scl/fi/1law34bbpncjpfqxtzisd/Magyar-T-zek.mp3?rlkey=s1rpoxyr3pb9dq2t8euxtg117&st=n0lbq087&dl=1",
  "https://www.dropbox.com/scl/fi/dm60xi68ybtorg2h5sykh/Speed-Circuit.mp3?rlkey=2pw90ceqj5tz9mapi89cxrl32&st=b7jqmkeb&dl=1",
  "https://www.dropbox.com/scl/fi/d23ffdceriocdvez7olye/Starlight-Circuit.mp3?rlkey=o4h1c1n42x9n0ryz1k9no4acr&st=lod15q5b&dl=1",
  "https://www.dropbox.com/scl/fi/v7rjtkj4slu6brt01780p/Top-Speed.mp3?rlkey=51qi29dl8nq1z0f7rs57e4yto&st=ormm9kyh&dl=1",
  "https://www.dropbox.com/scl/fi/ubpo1uf2qqcfa1y0sam8s/Traveling-Is-Fun-1.mp3?rlkey=c81h5upejn30itjp27trayutf&st=ucsbn0ux&dl=1",
  "https://www.dropbox.com/scl/fi/neqzwt2hw4eaubt23ecye/Traveling-Is-Fun.mp3?rlkey=ftv50scvsjgrxfutqg3l0fel9&st=u4iecrmb&dl=1",
  "https://www.dropbox.com/scl/fi/2maxm34hi9rivbq2w40ee/Tuna-Run.mp3?rlkey=emhzumrrheaqhl525msc3na8f&st=sz1umr9f&dl=1"   
];

/** 배경음악: WebView에서 ended 미발화·끝 구간 정지 감지용 */
const BG_MUSIC_NEAR_END_SEC = 0.38;
const BG_MUSIC_WATCHDOG_MS = 480;
const BG_MUSIC_ADVANCE_DEBOUNCE_MS = 420;
const BG_MUSIC_ERROR_SUPPRESS_MS = 400;

/**
 * 코칭 주기 발화 간격(ms).
 * R 밴드가 변하지 않아도 이 간격마다 같은 R 밴드의 tip 풀에서 랜덤 재추첨해 speak 한다.
 * 앱의 주된 용도인 "지루한 실내 주행 완화" 목적에 맞춰 30초 기준. 너무 짧으면 잔소리처럼
 * 들리고, 너무 길면 침묵이 길어지므로 경험적으로 선정.
 */
const COACH_PERIODIC_SPEAK_MS = 30_000;

/** OVER_QUERY_LIMIT 시에만 DEFAULT 재시도 생략 (비용·무한 폴백 방지). ZERO_RESULTS는 GOOGLE에만 없을 수 있으므로 DEFAULT(사용자 파노라마) 폴백 시도 */
const UNRECOVERABLE_STATUS = ['OVER_QUERY_LIMIT'];

/** API 무응답 시 무한 대기 방지. 정상 로딩이 3초를 넘길 수 있으므로 6초로 설정 (과민 경고 방지) */
const SV_GET_PANORAMA_TIMEOUT_MS = 6000;

/** setPanoramaView / setPanoramaViewByPanoId 전체 대기 상한. getPano + status OK까지 6초 허용 */
const PANORAMA_VIEW_TIMEOUT_MS = 6000;
/** A안 테스트: 더블 버퍼 대신 단일 파노라마를 연속 갱신해 주행 연속성 확인 */
const USE_CONTINUOUS_SV_DRIVE_THROUGH = true;

type SvResultReason = 'timeout' | 'no_pano';

/**
 * getPanorama with fallback: try GOOGLE first, then DEFAULT (includes user Photo Spheres).
 * Returns { data, usedFallback, reason? }. reason 'timeout' = 응답 지연, 'no_pano' = 실제 커버리지 없음.
 * 경고 메시지는 no_pano일 때만 표시하고, timeout은 표시하지 않음.
 */
const getPanoramaWithFallback = (
  service: any,
  opts: { location: any; radius: number; preference?: any }
): Promise<{ data: any; usedFallback: boolean; reason?: SvResultReason }> => {
  const apiPromise = new Promise<{ data: any; usedFallback: boolean; reason?: SvResultReason }>((resolve) => {
    service.getPanorama({
      location: opts.location,
      radius: opts.radius,
      source: google.maps.StreetViewSource.GOOGLE,
      preference: opts.preference ?? google.maps.StreetViewPreference.NEAREST
    }, (data: any, status: string) => {
      if (status === 'OK' && data?.location?.pano) {
        resolve({ data, usedFallback: false });
        return;
      }
      if (UNRECOVERABLE_STATUS.includes(status)) {
        resolve({ data: null, usedFallback: false, reason: 'no_pano' });
        return;
      }
      service.getPanorama({
        location: opts.location,
        radius: opts.radius,
        source: google.maps.StreetViewSource.DEFAULT,
        preference: opts.preference ?? google.maps.StreetViewPreference.NEAREST
      }, (fallbackData: any, fallbackStatus: string) => {
        if (fallbackStatus === 'OK' && fallbackData?.location?.pano) {
          resolve({ data: fallbackData, usedFallback: true });
        } else {
          resolve({ data: null, usedFallback: false, reason: 'no_pano' });
        }
      });
    });
  });
  const timeoutPromise = new Promise<{ data: any; usedFallback: boolean; reason?: SvResultReason }>((resolve) => {
    setTimeout(() => {
      console.warn('[SV] getPanorama timeout — no callback within', SV_GET_PANORAMA_TIMEOUT_MS, 'ms');
      resolve({ data: null, usedFallback: false, reason: 'timeout' });
    }, SV_GET_PANORAMA_TIMEOUT_MS);
  });
  return Promise.race([apiPromise, timeoutPromise]);
};

// Helper to wrap getPanorama in a Promise (no direction filter); uses GOOGLE then DEFAULT fallback
const findStreetView = (
  service: any,
  location: any,
  radius: number
): Promise<{ data: any; usedFallback: boolean } | null> => {
  return getPanoramaWithFallback(service, { location, radius }).then(({ data, usedFallback }) => {
    if (data) return { data, usedFallback };
    return null;
  });
};

/** Normalize angle difference to [-180, 180] */
function normalizeAngleDiff(deg: number): number {
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

/**
 * 주행 방향 각도 범위 내 거리뷰만 채택.
 * GOOGLE 먼저 시도, 없으면 DEFAULT(사용자 파노라마 포함) 폴백.
 */
const findStreetViewInDirection = (
  service: any,
  pathPoint: any,
  pathNext: any,
  pathIndex: number,
  path: any[],
  radius: number,
  maxAngleDeg: number = 110
): Promise<PanoDataItem | null> => {
  return getPanoramaWithFallback(service, {
    location: pathPoint,
    radius,
    preference: google.maps.StreetViewPreference.NEAREST
  }).then(({ data, usedFallback }) => {
    if (!data?.location?.pano) return null;
    const driveHeading = computeHeading(pathPoint, pathNext);
    const panoLatLng = data.location.latLng;
    const bearingToPano = computeHeading(pathPoint, panoLatLng);
    const angleDiff = Math.abs(normalizeAngleDiff(bearingToPano - driveHeading));
    if (angleDiff > maxAngleDeg) return null;
    const nextIdx = Math.min(pathIndex + 10, path.length - 1);
    const heading = computeHeading(pathPoint, path[nextIdx]);
    return {
      pathIndex,
      panoId: data.location.pano,
      location: data.location.latLng,
      heading,
      isUserPhoto: usedFallback,
      description: data.location?.description ?? undefined
    };
  });
};

/** [Phase 2] Multi-pass 1단계: 반경(m), 주행 방향 ±각도(°). 시니어 권고 50m ±40° */
const SV_PASS1_RADIUS_M = 50;
const SV_PASS1_MAX_ANGLE_DEG = 40;
/** Pass1 실패 시 재시도 각도(°). 차로 전환 등으로 40° 밖에 파노가 있을 때 멈춤 방지, 실내 파노는 이후 필터로 제외 */
const SV_PASS1_RELAXED_ANGLE_DEG = 90;
/** [Phase 2] Multi-pass 2단계: 반경(m), 방향 제한 없음. 시니어 권고 120m */
const SV_PASS2_RADIUS_M = 120;
/** [Phase 2] 점수 가중치: 거리 60%, 방향 40%. score = 0.6*(1-d/maxD) + 0.4*(1-diff/90) */
const SV_SCORE_DIST_WEIGHT = 0.6;
const SV_SCORE_ANGLE_WEIGHT = 0.4;
const SV_SCORE_ANGLE_DENOM_DEG = 90;
/** [Phase 4] 실내/상가 파노 제외용. description에 포함 시 후보에서 제외 (tilt는 getPanorama 응답에 없음) */
const SV_INDOOR_KEYWORDS = /Shop|Indoor|Business/i;
/** [Phase 5] coverage 미만이면 거리뷰 부족 안내 (Street View 비활성 또는 배지) */
const COVERAGE_MIN = 0.7;
/** [Phase 1 이후 미사용] 주행 중 실시간 검색 제거로 사용 안 함. */
const MAX_REALTIME_SV_ATTEMPTS = 3;

/** 주행 위치 강제 이동 시 한 번에 이동할 경로 포인트 수 (Backward / Fast Forward) */
const STEP_OFFSET = 5;

/** 속도 기준: 이 값 이상이면 초기 거리뷰 수집 300m, 미만이면 100m. 주행 중 40 이상으로 올리면 해당 위치부터 300m 확장 수집 */
const SPEED_THRESHOLD_KMH = 40;
const INITIAL_PREFETCH_HIGH_M = 300;
const INITIAL_PREFETCH_LOW_M = 100;

/** True when current inputs match the last successful route request (for Go reuse). */
function inputsMatch(
  origin: string,
  destination: string,
  waypoints: { name: string; location: any }[],
  mode: TravelMode,
  last: { origin: string; destination: string; waypointNames: string[]; mode: TravelMode }
): boolean {
  if (mode !== last.mode) return false;
  if (origin.trim() !== last.origin || destination.trim() !== last.destination) return false;
  if (waypoints.length !== last.waypointNames.length) return false;
  return waypoints.every((w, i) => (w.name || '').trim() === (last.waypointNames[i] || '').trim());
}

const App: React.FC = () => {
  // Map & Service References
  const mapRef = useRef<HTMLDivElement>(null);

  // Double Buffering Refs
  const svContainerRef = useRef<HTMLDivElement>(null);
  const svRef1 = useRef<HTMLDivElement>(null);
  const svRef2 = useRef<HTMLDivElement>(null);
  const panorama1 = useRef<any>(null);
  const panorama2 = useRef<any>(null);
  const activePanoRef = useRef<number>(0); // 0 or 1
  const [visiblePanoIdx, setVisiblePanoIdx] = useState<number>(0); // Controls Z-Index

  const googleMapRef = useRef<google.maps.Map | null>(null);
  const googlePolylineRef = useRef<google.maps.Polyline | null>(null);
  const streetViewCoverageLayerRef = useRef<google.maps.StreetViewCoverageLayer | null>(null);
  const googleMarkersRef = useRef<google.maps.Marker[]>([]);
  const simulationMarker = useRef<google.maps.Marker | null>(null);
  const startMarker = useRef<google.maps.Marker | null>(null);
  const endMarker = useRef<google.maps.Marker | null>(null);
  const waypointMarkers = useRef<google.maps.Marker[]>([]);
  const tempMarker = useRef<google.maps.Marker | null>(null);
  const searchMarkerRef = useRef<google.maps.Marker | null>(null);
  const searchMarkerCloseOverlayRef = useRef<any>(null);
  const svServiceRef = useRef<any>(null);
  const svErrorCount = useRef(0);
  const isSvSearching = useRef(false); // Semaphore to prevent overlapping SV searches
  const isSegmentFetchingRef = useRef(false); // Prevent overlapping on-demand segment fetches
  /** Street View 표시용 path index: 시뮬 속도와 분리해 최대 60 km/h로만 진행해 고속에서도 거리뷰가 부드럽게 전환되도록 함 */
  const svDisplayPathIndexRef = useRef(0);
  const lastSvDisplayUpdateRef = useRef(0);
  /** 마지막으로 표시한 파노의 pathIndex — 더 작은 인덱스로 갱신해 후진처럼 보이는 현상 방지 */
  const lastDisplayedPanoPathIndexRef = useRef(-1);
  const pendingSwapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Cancel previous swap when called again
  const pendingSwapFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Fallback swap if status_changed never OK (방안 A)

  // Exact Coordinate References (Fix for Road Snapping)
  const originLocationRef = useRef<any>(null);
  const destLocationRef = useRef<any>(null);

  // Last route request params: reuse route on Go when inputs unchanged (avoid duplicate Directions/Elevation)
  const lastRouteRequestRef = useRef<{ origin: string; destination: string; waypointNames: string[]; mode: TravelMode } | null>(null);
  /** Favorites 복원 함수 ref (handleLoadFavorite보다 나중에 정의되므로 ref로 호출) */
  const restoreRouteFromSavedGeometryRef = useRef<((saved: SavedRoute) => Promise<void>) | null>(null);
  /** OSRM 원본 decode geometry ([lat,lng][]). 저장 시 densify 전 원본 유지용. 복원 시 payload.fullGeometry 로 세팅. */
  const lastOsrmDecodedPathRef = useRef<[number, number][] | null>(null);

  // Audio References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const simulationActiveRef = useRef(false);
  const speechStartTimeoutRef = useRef<number | null>(null);
  /** speak 함수 ref — speak 정의 이전 useEffect(카운트다운 TTS 웜업 등)에서 참조하기 위한 포인터 */
  const speakRef = useRef<((text: string) => void) | null>(null);
  const speechRequestIdRef = useRef(0);
  const musicOnRef = useRef(true);
  const pendingAudioPauseRef = useRef(false);
  const lastMusicTrackRef = useRef<string | null>(null);
  const musicRetryTokenRef = useRef(0);
  const bgMusicLastAdvanceMsRef = useRef(0);
  const bgMusicWatchdogTimerRef = useRef<number | null>(null);
  const bgMusicSuppressErrorAdvanceUntilRef = useRef(0);
  const maybeAdvanceBackgroundMusicRef = useRef<(reason: 'ended' | 'error' | 'watchdog' | 'visibility') => void>(() => { });
  const onVisibilityForBgMusicRef = useRef<() => void>(() => { });
  /** 주행 마커 이미지 base64 (data URI). SVG 내부 참조용 — data URI SVG에서 외부 URL은 로드되지 않음 */
  const cyclingMarkerDataUrlRef = useRef<string | null>(null);
  /** 맵/경로 클릭 시 위치 선택 (주소·표고 조회 후 인포윈도우). ref로 두어 폴리라인 생성 시에도 동일 로직 사용 */
  const handleLocationClickRef = useRef<(lat: number, lng: number) => void>(() => { });
  const triggerMapResize = useCallback((map?: google.maps.Map | null) => {
    const targetMap = map ?? googleMapRef.current;
    const eventApi = (window as any).google?.maps?.event;
    if (!eventApi || !targetMap) return false;
    // WebView timing race: map 인스턴스가 해제/전환 중이면 trigger 내부에서 예외가 날 수 있다.
    if (typeof (targetMap as any).getDiv !== 'function') return false;
    try {
      eventApi.trigger(targetMap, 'resize');
      return true;
    } catch (e) {
      console.warn('[Map] resize trigger skipped due to transient map state:', e);
      return false;
    }
  }, []);

  // App Core State
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const routeRef = useRef<RouteInfo | null>(null); // stale closure 방지용 route 참조
  const [simulation, setSimulation] = useState<SimulationState>({ isActive: false, currentIndex: 0, speed: 100 });
  const [speedKmH, setSpeedKmH] = useState(20);
  const [sensorPrefs, setSensorPrefs] = useState(() => loadIndoorSensorPrefs());
  const [sensorsModalOpen, setSensorsModalOpen] = useState(false);
  const [effectiveSpeedKmH, setEffectiveSpeedKmH] = useState(20);
  const effectiveSpeedKmHRef = useRef(effectiveSpeedKmH);
  const [currentRpm, setCurrentRpm] = useState<number | null>(null);
  const [averageRpm, setAverageRpm] = useState(0);
  const rpmSampleSumRef = useRef(0);
  const rpmSampleCountRef = useRef(0);
  const [sensorHubConnected, setSensorHubConnected] = useState(false);
  /** HUD 블루투스 아이콘: On+연결 시 녹색, 스캔·연결 중 점멸, On인데 미연결·유휴 시 흰색 (항상 표시). */
  const [sensorBleBusyHud, setSensorBleBusyHud] = useState(() => {
    const hub = getIndoorBleHub();
    const phase = hub.getAutoConnectPhase();
    return hub.isScanning() || phase === 'scanning' || phase === 'connecting';
  });
  const [speedSource, setSpeedSource] = useState<SpeedSource>('manual');
  const [hasCadenceSignal, setHasCadenceSignal] = useState(false);
  const [bikeProfileModalOpen, setBikeProfileModalOpen] = useState(false);
  const bikeProfileModalOpenRef = useRef(false);
  bikeProfileModalOpenRef.current = bikeProfileModalOpen;
  /** BLE was disconnected last tick — used to turn on sensor-based ride only on connect edge. */
  const prevBleSensorConnectedRef = useRef(false);
  /** Wheel channel must be valid for this long before triggering the bike profile prompt. */
  const wheelStableSinceRef = useRef<number | null>(null);
  const bikeProfilePromptSuppressedRef = useRef(false);
  const sensorMergeStateRef = useRef(createDualMergeState());
  const speedFilterStateRef = useRef<SpeedFilterState>(createSpeedFilterState());
  const sensorPrefsRef = useRef(sensorPrefs);
  sensorPrefsRef.current = sensorPrefs;
  const speedKmHRef = useRef(speedKmH);
  speedKmHRef.current = speedKmH;
  effectiveSpeedKmHRef.current = effectiveSpeedKmH;
  /** EMA(alpha=0.2) of RPM used for intensity */
  const sensorRpmEmaRef = useRef<number | null>(null);
  const sensorLastValidRpmRef = useRef<number | null>(null);
  const sensorLastValidRpmAtRef = useRef(0);
  const sensorBelowMoveThresholdSinceRef = useRef<number | null>(null);
  const sensorCapacityLiveRef = useRef(90);
  const sensorCapacitySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SENSOR_RPM_HOLD_MS = 2000;
  const SENSOR_MOVE_STOP_KMH = 0.2;
  const SENSOR_STOP_GRACE_MS = 2200;
  const SENSOR_PEDALING_RPM_THRESHOLD = 8;
  const SENSOR_NO_PACKET_FORCE_ZERO_MS = 3500;
  const SENSOR_HARD_STOP_MS = 3000;
  const SENSOR_DISPLAY_ZERO_RPM = 1;
  const SENSOR_HARD_ZERO_MS = 2500;
  const [mode, setMode] = useState<TravelMode>(TravelMode.DRIVING);
  const [loading, setLoading] = useState(false);
  const [isSvActive, setIsSvActive] = useState(false);
  const [isSvFullScreen, setIsSvFullScreen] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [svStatus, setSvStatus] = useState<string>('');
  const [showSvWarning, setShowSvWarning] = useState(false);
  const [isUserPano, setIsUserPano] = useState(false); // true when showing user-contributed panorama (fallback)
  /**
   * Elevation 데이터 상태 표시:
   *  - kind 'ok': 표고 정상, provider 표시(디버그 배지)
   *  - kind 'flat': 표고 API 실패 → 평지 폴백, 사용자에게 토스트 안내
   *  - null: 아직 결정 전
   */
  const [elevationStatus, setElevationStatus] = useState<{ kind: 'ok' | 'flat'; provider?: 'open-elevation' | 'opentopodata' } | null>(null);
  const elevationFlatToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showElevationFlatToast = useCallback(() => {
    setElevationStatus({ kind: 'flat' });
    if (elevationFlatToastTimerRef.current) clearTimeout(elevationFlatToastTimerRef.current);
    // 5초 후 토스트만 자동 닫힘 (배지는 'flat' 그대로 유지하지 않고 비웁니다)
    elevationFlatToastTimerRef.current = setTimeout(() => {
      setElevationStatus((prev) => (prev?.kind === 'flat' ? null : prev));
    }, 5000);
  }, []);
  const [routeSource, setRouteSource] = useState<'GOOGLE' | 'OSRM' | null>(null);
  const [mapType, setMapType] = useState<string>('roadmap');
  const mapTypeRef = useRef(mapType);
  mapTypeRef.current = mapType;
  const [showAbout, setShowAbout] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<'list' | 'about' | 'guideSimple' | 'guideDetail' | 'privacy' | 'terms' | 'disclaimer' | 'licenses' | 'contact'>('list');

  // Independent Timer States for Elevation Chart
  const [elapsedTime, setElapsedTime] = useState(0);
  const [coveredDistance, setCoveredDistance] = useState(0);

  // Advanced Coach State
  const [coachData, setCoachData] = useState<CoachingData | null>(null);
  const [isCoachThinking, setIsCoachThinking] = useState(false);
  const lastCoachedIndex = useRef<number>(-1);
  const lastValidUntilFetched = useRef<number>(-1);
  /** 프리페치가 동시에 여러 번 돌지 않도록 하는 재진입 가드 */
  const isPrefetchingCoachRef = useRef<boolean>(false);
  /** 캐시된 세그먼트 진입 시 음성 한 번만 재생하기 위해, 마지막으로 speak한 세그먼트의 validUntilPathIndex */
  const lastSpokenValidUntilPathIndex = useRef<number | null>(null);
  /** 마지막 코칭 TTS 시각(ms) — 같은 R 이 길게 이어지는 구간에서도 주기적으로 랜덤 tip 을 재추첨 재생하기 위함 */
  const lastCoachSpeakAtMsRef = useRef<number>(0);
  /** 마지막으로 speak 한 resistance 텍스트("Resistance N" / "Steady"). R 변화 감지용. */
  const lastSpokenResistanceRef = useRef<string | null>(null);
  /** 마지막으로 speak 한 tip 인덱스(0~31). 같은 R 에서 직전 tip 을 피해 재추첨하기 위해 사용. */
  const lastSpokenTipIndexRef = useRef<number | null>(null);

  // Folding States
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [routeInputExpanded, setRouteInputExpanded] = useState(true);
  const [routeSettingsPanelExpanded, setRouteSettingsPanelExpanded] = useState(true); // 왼쪽 '경로설정' 패널만 접기/펼치기
  const [elevationExpanded, setElevationExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false); // 초기 실행 시 My Routes 패널 접힌 상태
  /** 우측 경로 목록: 저장 경로 vs 추천(파이어베이스 연동 예정) */
  const [historyPanelTab, setHistoryPanelTab] = useState<'my_routes' | 'recommended'>('my_routes');
  const [coachingOn, setCoachingOn] = useState(true);
  const [coachingMentVisible, setCoachingMentVisible] = useState(true); // 화면 상단 코칭 멘트 텍스트 표시 여부
  const [musicOn, setMusicOn] = useState(true);

  // Input States
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [waypoints, setWaypoints] = useState<{ name: string, location: any }[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  /** 출발/도착 입력란 자동완성 추천 목록 */
  const [originSuggestions, setOriginSuggestions] = useState<SearchSuggestionItem[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<SearchSuggestionItem[]>([]);
  const [showOriginSuggestions, setShowOriginSuggestions] = useState(false);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);
  /** 추천 목록 키보드 포커스 인덱스 (-1: 없음) */
  const [originHighlightIndex, setOriginHighlightIndex] = useState(-1);
  const [destinationHighlightIndex, setDestinationHighlightIndex] = useState(-1);
  /** 상단 장소 검색 자동완성 */
  const [placeSearchSuggestions, setPlaceSearchSuggestions] = useState<SearchSuggestionItem[]>([]);
  const [showPlaceSearchSuggestions, setShowPlaceSearchSuggestions] = useState(false);
  const [placeSearchHighlightIndex, setPlaceSearchHighlightIndex] = useState(-1);
  const originSuggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destSuggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placeSuggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originSuggestReqIdRef = useRef(0);
  const destSuggestReqIdRef = useRef(0);
  const placeSuggestReqIdRef = useRef(0);
  const closeOriginSuggestRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeDestSuggestRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closePlaceSuggestRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeInputContainerRef = useRef<HTMLDivElement | null>(null);
  const searchBarContainerRef = useRef<HTMLDivElement | null>(null);
  const originSuggestionItemRef = useRef<HTMLButtonElement | null>(null);
  const destSuggestionItemRef = useRef<HTMLButtonElement | null>(null);
  /** 항목 선택 직후에는 추천 목록을 다시 열지 않음 */
  const originJustSelectedRef = useRef(false);
  const destJustSelectedRef = useRef(false);
  const placeJustSelectedRef = useRef(false);
  /** 맵 클릭으로 출발/도착이 설정된 경우 해당 턴에서는 추천 목록을 표시하지 않음 */
  const originSetFromMapClickRef = useRef(false);
  const destSetFromMapClickRef = useRef(false);
  /** 출발↔도착 스왑으로 문자열만 바뀐 경우 해당 턴에서는 추천 목록을 표시하지 않음 */
  const originSetFromSwapRef = useRef(false);
  const destSetFromSwapRef = useRef(false);

  const [isMapReady, setIsMapReady] = useState(false);
  const [isMapsApiLoaded, setIsMapsApiLoaded] = useState(false);
  /** Maps JS/키/컨테이너 준비 실패 시 사용자에게 표시(인트로는 걷어서 콘트롤은 보이게 함). */
  const [googleMapsBootstrapError, setGoogleMapsBootstrapError] = useState<string | null>(null);
  const [mapRevealed, setMapRevealed] = useState(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.innerHeight >= window.innerWidth;
  });
  /** 브라우저 Geolocation API로 얻은 사용자 현재 위치 (지도 초기 중심용) */
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Traffic optimization: phase (PREPARING = API allowed, RUNNING = cache only)
  const [appPhase, setAppPhase] = useState<AppPhase>('IDLE');
  const [preparingProgress, setPreparingProgress] = useState<{ k: number; n: number } | null>(null);

  // AdMob state (Android only). Rewarded ad insertion은 추후 진행.
  const [admobReady, setAdmobReady] = useState(false);
  const lastAppPhaseRef = useRef<AppPhase>(appPhase);
  const lastSimulationActiveRef = useRef<boolean>(simulation.isActive);
  const interstitialShownRef = useRef(false);
  const interstitialPreparedRef = useRef(false);
  const interstitialPreparePromiseRef = useRef<Promise<void> | null>(null);

  // Rewarded ad flow (ride extension)
  const rewardPreparedRef = useRef(false);
  const rewardPreparePromiseRef = useRef<Promise<void> | null>(null);
  const rewardAdInFlightRef = useRef(false);

  const rideAllowedLimitMetersRef = useRef<number>(DEFAULT_RIDE_LIMIT_M);
  const rideTargetMetersRef = useRef<number>(DEFAULT_RIDE_LIMIT_M);
  const rewardGrantedForRideRef = useRef(false);
  const rewardFirstDeclinedRef = useRef(false);
  const rewardSecondDeclinedRef = useRef(false);
  const rewardSecondOfferShownRef = useRef(false);
  const rideStoppedByLimitRef = useRef(false);

  const rewardPendingRouteRef = useRef<RouteInfo | null>(null);
  const [rewardOfferModalStage, setRewardOfferModalStage] = useState<'FIRST' | 'SECOND' | null>(null);
  const [rewardOfferTargetKm, setRewardOfferTargetKm] = useState<number>(0);
  const [rideLimitMessage, setRideLimitMessage] = useState<string | null>(null);
  const [maxRideLimitMessage, setMaxRideLimitMessage] = useState<string | null>(null);

  const lastPanToTime = useRef<number>(0);
  /** 주행 중 속도가 SPEED_THRESHOLD_KMH 미만 → 이상으로 올랐을 때 확장 prefetch 트리거용 */
  const prevSpeedKmHRef = useRef(20);

  // Go 버튼 클릭 시 4초 카운트다운 (3, 2, 1, Start!) — 로딩 대기 시간 활용
  const [countdown, setCountdown] = useState<3 | 2 | 1 | 'start' | null>(null);
  const countdownDoneRef = useRef<(() => void) | null>(null);

  // 인트로 종료 후 "Please click 2 points on the road." 3초간 표시
  const [showClickTwoPointsHint, setShowClickTwoPointsHint] = useState(false);

  /** Android 뒤로가기 2회 종료 안내 토스트 */
  const [androidExitHintVisible, setAndroidExitHintVisible] = useState(false);
  const lastAndroidExitPressRef = useRef(0);
  const androidExitHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const androidBackStateRef = useRef({
    rewardOfferModalStage: null as 'FIRST' | 'SECOND' | null,
    maxRideLimitMessage: null as string | null,
    rideLimitMessage: null as string | null,
    showAbout: false,
    menuOpen: false,
    searchExpanded: false,
    hasClickedLocation: false,
    showOriginSuggestions: false,
    showDestinationSuggestions: false,
    showPlaceSearchSuggestions: false,
    countdownActive: false,
    historyExpanded: false,
    routeSettingsPanelExpanded: true,
    routeInputExpanded: true,
    hasRoute: false,
    elevationExpanded: true,
    streetViewFullScreen: false,
    sensorsModalOpen: false,
    bikeProfileModalOpen: false,
  });

  // start/end 둘 다 선택된 경우 car·bike·foot 버튼 1초간 순차 20% 확대 유도 (3회 반복)
  const [modeButtonPulseIndex, setModeButtonPulseIndex] = useState<-1 | 0 | 1 | 2>(-1);
  const hasShownModePulseRef = useRef(false);

  // 경로(car/bike/foot) 선택 시 Go 버튼 1초간 20% 확대 유도 (의도한 UX만: 새 경로 계산 완료 시에만, autoStart 아닐 때)
  const [goButtonPulse, setGoButtonPulse] = useState(false);
  const goButtonPulseTimeoutsRef = useRef<number[]>([]);

  // Favorites (My Routes) State
  const [favoriteRoutes, setFavoriteRoutes] = useState<SavedRoute[]>(() => {
    const saved = parseSavedRoutes(localStorage.getItem(FAVORITE_ROUTES_STORAGE_KEY));
    return saved;
  });
  const [lockedRouteProfile, setLockedRouteProfile] = useState<'cycling' | 'driving' | 'foot' | null>(null);

  // Recent Place Searches (SearchBar)
  const [recentPlaceSearches, setRecentPlaceSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem('recent_places');
    return saved ? JSON.parse(saved) : [];
  });

  const [clickedLocation, setClickedLocation] = useState<{ lat: number, lng: number, name?: string, address: string, elevation: number | null, location: any } | null>(null);

  useEffect(() => {
    const storedVersionRaw = localStorage.getItem(FAVORITE_ROUTES_INIT_VERSION_KEY);
    const storedVersion = storedVersionRaw ? Number(storedVersionRaw) : 0;
    const needsInitialSeed = favoriteRoutes.length === 0;
    // 기존 DEFAULT 슬롯이 payload 없이 저장돼 있으면 최신 번들(v2)로 교체.
    // USER 슬롯은 유지하고 DEFAULT 슬롯만 교체해 사용자 저장 경로 보존.
    const hasStaleDefaults =
      storedVersion < BUNDLED_MY_ROUTES_VERSION &&
      favoriteRoutes.some((r) => r.source === 'DEFAULT' && !isOfflineRestorablePayload(r.routePayload));
    if (!needsInitialSeed && !hasStaleDefaults) return;

    let cancelled = false;
    loadBundledDefaultRoutes()
      .then((defaults) => {
        if (cancelled || defaults.length === 0) return;
        if (needsInitialSeed) {
          setFavoriteRoutes(defaults);
          localStorage.setItem(FAVORITE_ROUTES_STORAGE_KEY, JSON.stringify(defaults));
        } else {
          // stale DEFAULT 교체: USER 슬롯 보존 + DEFAULT 교체 (MY_ROUTES_MAX 한도 내)
          setFavoriteRoutes((prev) => {
            const userRoutes = prev.filter((r) => r.source !== 'DEFAULT');
            const merged = [...userRoutes, ...defaults].slice(0, 5);
            localStorage.setItem(FAVORITE_ROUTES_STORAGE_KEY, JSON.stringify(merged));
            return merged;
          });
        }
        localStorage.setItem(FAVORITE_ROUTES_INIT_VERSION_KEY, String(BUNDLED_MY_ROUTES_VERSION));
      })
      .catch((e) => {
        console.warn('[MY_ROUTES] failed to seed bundled defaults', e);
      });
    return () => { cancelled = true; };
  }, [favoriteRoutes]);

  useEffect(() => {
    androidBackStateRef.current = {
      rewardOfferModalStage,
      maxRideLimitMessage,
      rideLimitMessage,
      showAbout,
      menuOpen,
      searchExpanded,
      hasClickedLocation: clickedLocation !== null,
      showOriginSuggestions,
      showDestinationSuggestions,
      showPlaceSearchSuggestions,
      countdownActive: countdown !== null,
      historyExpanded,
      routeSettingsPanelExpanded,
      routeInputExpanded,
      hasRoute: route !== null,
      elevationExpanded,
      streetViewFullScreen: isSvActive && isSvFullScreen,
      sensorsModalOpen,
      bikeProfileModalOpen,
    };
  }, [
    rewardOfferModalStage,
    maxRideLimitMessage,
    rideLimitMessage,
    showAbout,
    menuOpen,
    searchExpanded,
    clickedLocation,
    showOriginSuggestions,
    showDestinationSuggestions,
    showPlaceSearchSuggestions,
    countdown,
    historyExpanded,
    routeSettingsPanelExpanded,
    routeInputExpanded,
    route,
    elevationExpanded,
    isSvActive,
    isSvFullScreen,
    sensorsModalOpen,
    bikeProfileModalOpen,
  ]);

  useEffect(() => {
    if (!sensorPrefs.sensorDriveEnabled) {
      setEffectiveSpeedKmH(speedKmH);
    }
  }, [sensorPrefs.sensorDriveEnabled, speedKmH]);

  useEffect(() => {
    const cap0 =
      sensorPrefs.capacityRpm ??
      (sensorPrefs.calibrationAvgRpm != null ? sensorPrefs.calibrationAvgRpm / 0.9 : null) ??
      presetCapacityRpm(sensorPrefs.fitnessLevel);
    sensorCapacityLiveRef.current = Math.max(35, cap0);
  }, [sensorPrefs.capacityRpm, sensorPrefs.calibrationAvgRpm, sensorPrefs.fitnessLevel]);

  useEffect(() => {
    if (!sensorPrefs.sensorDriveEnabled) return;
    const hub = getIndoorBleHub();
    const snap = hub.buildSnapshot();
    const cap = sensorCapacityLiveRef.current;
    const decision = decideSpeed(
      snap,
      sensorPrefs,
      cap,
      speedFilterStateRef.current,
      speedKmHRef.current
    );
    setEffectiveSpeedKmH(decision.kmh);
    setSpeedSource(decision.source);
  }, [
    sensorPrefs.sensorDriveEnabled,
    sensorPrefs.fitnessLevel,
    sensorPrefs.speedCadenceBlendMode,
    sensorPrefs.calibrationAvgRpm,
    sensorPrefs.wheelCadenceK,
    sensorPrefs.capacityRpm,
    sensorPrefs.wheelCircumferenceMm,
  ]);

  useEffect(() => {
    setSensorHubConnected(getIndoorBleHub().connectedCount() > 0);
  }, []);

  useEffect(() => {
    const hub = getIndoorBleHub();
    const syncBleHudBusy = () => {
      const phase = hub.getAutoConnectPhase();
      setSensorBleBusyHud(hub.isScanning() || phase === 'scanning' || phase === 'connecting');
    };
    syncBleHudBusy();
    return hub.subscribe(syncBleHudBusy);
  }, []);

  // Silent auto-connect to sensors on app launch.
  // - On launch, always keep a background scan/connect loop so advertising sensors can auto-join.
  // - Saved devices still have priority; unknown CSC/FTMS sensors can fill free slots.
  // - A background retry loop keeps trying whenever the sensor drops and re-advertises
  //   (e.g., cadence sensor sleeps between rides and wakes up on the next pedal stroke).
  useEffect(() => {
    const p = sensorPrefsRef.current;
    if (!p.autoReconnectEnabled || !p.sensorDriveEnabled) return;
    const hub = getIndoorBleHub();
    const savedDevices = p.lastConnectedDevices ?? [];
    const allowUnknown = true;

    hub.requestPersistentConnection(savedDevices, { allowUnknown });
    hub
      .tryAutoReconnect(savedDevices, { allowUnknown, scanDurationMs: 12000 })
      .then(() => {
        setSensorHubConnected(hub.connectedCount() > 0);
      })
      .catch(() => {
        // Silent: user can still open the Sensors modal to connect manually.
      });
  }, []);

  const scheduleSensorCapacityPersist = useCallback((cap: number) => {
    if (sensorCapacitySaveTimerRef.current) clearTimeout(sensorCapacitySaveTimerRef.current);
    sensorCapacitySaveTimerRef.current = setTimeout(() => {
      sensorCapacitySaveTimerRef.current = null;
      const rounded = Math.round(cap * 100) / 100;
      const next = { ...sensorPrefsRef.current, capacityRpm: rounded };
      sensorPrefsRef.current = next;
      setSensorPrefs(next);
      saveIndoorSensorPrefs(next);
    }, 2500);
  }, []);

  /** 주행 중 체감 배율 feelK 조정. 센서 모드 속도에 직접 곱해짐. */
  const setFeelK = useCallback((nextFeel: number) => {
    const clamped = clampFeelK(nextFeel);
    const next = { ...sensorPrefsRef.current, feelK: clamped };
    sensorPrefsRef.current = next;
    setSensorPrefs(next);
    saveIndoorSensorPrefs(next);
  }, []);
  const adjustFeelKUp = useCallback(() => {
    setFeelK((sensorPrefsRef.current.feelK ?? 1) + FEEL_K_STEP);
  }, [setFeelK]);
  const adjustFeelKDown = useCallback(() => {
    setFeelK((sensorPrefsRef.current.feelK ?? 1) - FEEL_K_STEP);
  }, [setFeelK]);
  const resetFeelK = useCallback(() => {
    setFeelK(1);
  }, [setFeelK]);

  /** HUD 블루투스 버튼: 센서 스캔·연결·감지(속도 반영)을 한 번에 켜고 끔. Sensors 모달은 상세 설정 전용. */
  const toggleSensorQuickMode = useCallback(async () => {
    const hub = getIndoorBleHub();
    const cur = sensorPrefsRef.current;
    const goingOn = !cur.sensorDriveEnabled;
    if (goingOn) {
      const next = { ...cur, sensorDriveEnabled: true };
      sensorPrefsRef.current = next;
      setSensorPrefs(next);
      saveIndoorSensorPrefs(next);
      const saved = next.lastConnectedDevices ?? [];
      const allowUnknown = next.autoReconnectEnabled;
      if (next.autoReconnectEnabled) {
        hub.requestPersistentConnection(saved, { allowUnknown: true });
      }
      try {
        await hub.tryAutoReconnect(saved, { allowUnknown, scanDurationMs: 12000 });
      } catch {
        // ignore
      }
      setSensorHubConnected(hub.connectedCount() > 0);
      return;
    }
    const next = { ...cur, sensorDriveEnabled: false };
    sensorPrefsRef.current = next;
    setSensorPrefs(next);
    saveIndoorSensorPrefs(next);
    hub.stopPersistentConnection();
    try {
      await hub.stopScan();
    } catch {
      // ignore
    }
    try {
      await hub.disconnectAll();
    } catch {
      // ignore
    }
    setSensorHubConnected(false);
    prevBleSensorConnectedRef.current = false;
  }, []);

  useEffect(() => {
    const hub = getIndoorBleHub();
    return hub.subscribe(() => {
      const connected = hub.connectedCount() > 0;
      setSensorHubConnected(connected);

      if (connected) {
        if (!prevBleSensorConnectedRef.current) {
          prevBleSensorConnectedRef.current = true;
          if (!sensorPrefsRef.current.sensorDriveEnabled) {
            const next = { ...sensorPrefsRef.current, sensorDriveEnabled: true };
            sensorPrefsRef.current = next;
            setSensorPrefs(next);
            saveIndoorSensorPrefs(next);
          }
        }
      } else {
        prevBleSensorConnectedRef.current = false;
      }

      const p = sensorPrefsRef.current;
      const base = speedKmHRef.current;
      if (!p.sensorDriveEnabled) {
        sensorRpmEmaRef.current = null;
        sensorLastValidRpmRef.current = null;
        sensorLastValidRpmAtRef.current = 0;
        setEffectiveSpeedKmH(base);
        setCurrentRpm(null);
        setSpeedSource('manual');
        setHasCadenceSignal(false);
        return;
      }
      const snap = hub.buildSnapshot();
      const cadenceNowValid = snap.cadenceRpm != null && snap.cadenceRpm >= 6 && snap.now - snap.cadenceTs < 3000;
      setHasCadenceSignal(cadenceNowValid);
      maybeUpdateWheelCadenceK(snap, p, (k) => {
        const next = { ...sensorPrefsRef.current, wheelCadenceK: k };
        sensorPrefsRef.current = next;
        setSensorPrefs(next);
        saveIndoorSensorPrefs(next);
      });

      const now = Date.now();
      const picked = pickRpmForIntensity(snap, p, sensorMergeStateRef.current);
      const pickedValid = picked != null && picked > 0;

      if (pickedValid) {
        sensorLastValidRpmRef.current = picked;
        sensorLastValidRpmAtRef.current = now;
      }

      const lastValidAt = sensorLastValidRpmAtRef.current;
      const sinceLastValid = lastValidAt > 0 ? now - lastValidAt : Number.POSITIVE_INFINITY;
      const hardZero = sinceLastValid >= SENSOR_HARD_ZERO_MS;

      let raw: number | null = null;
      if (pickedValid) {
        raw = picked;
      } else if (
        !hardZero &&
        sensorLastValidRpmRef.current != null &&
        sinceLastValid <= SENSOR_RPM_HOLD_MS
      ) {
        raw = sensorLastValidRpmRef.current;
      }

      const prevEma = sensorRpmEmaRef.current;
      let ema: number | null;
      if (hardZero) {
        ema = 0;
        sensorRpmEmaRef.current = null;
      } else if (raw != null && raw > 0) {
        ema = prevEma == null ? raw : 0.2 * raw + 0.8 * prevEma;
        sensorRpmEmaRef.current = ema;
      } else {
        ema = prevEma == null ? null : prevEma * 0.94;
        sensorRpmEmaRef.current = ema;
      }

      let cap = sensorCapacityLiveRef.current;
      if (ema != null && ema > 5) {
        cap = Math.max(35, cap * 0.995 + ema * 0.005);
        sensorCapacityLiveRef.current = cap;
        scheduleSensorCapacityPersist(cap);
      }

      if (hardZero) {
        setEffectiveSpeedKmH(0);
        setCurrentRpm(0);
        speedFilterStateRef.current.emaKmh = 0;
        setSpeedSource('coast');
      } else {
        // Speed: decided by trainer > wheel > cadence (advisor's layered model).
        const decision = decideSpeed(snap, p, cap, speedFilterStateRef.current, base);
        setEffectiveSpeedKmH(decision.kmh);
        setSpeedSource(decision.source);
        // RPM display / capacity learning remain cadence-driven.
        setCurrentRpm(ema != null && ema > 0 ? ema : 0);
      }

      // Bike profile 1회 감지: wheel 채널이 3초 이상 안정적으로 유효하면 프롬프트.
      const wheelNowValid = snap.wheelRpm != null && snap.wheelRpm > 0 && snap.now - snap.wheelTs < 2500;
      if (wheelNowValid) {
        if (wheelStableSinceRef.current == null) wheelStableSinceRef.current = snap.now;
        const stableFor = snap.now - wheelStableSinceRef.current;
        if (
          stableFor >= 3000 &&
          p.bikeProfile === 'unset' &&
          !bikeProfilePromptSuppressedRef.current &&
          !bikeProfileModalOpenRef.current
        ) {
          setBikeProfileModalOpen(true);
        }
      } else {
        wheelStableSinceRef.current = null;
      }
      if (simulationActiveRef.current && ema != null && ema > 0) {
        rpmSampleSumRef.current += ema;
        rpmSampleCountRef.current += 1;
        setAverageRpm(rpmSampleSumRef.current / rpmSampleCountRef.current);
      }
    });
  }, [scheduleSensorCapacityPersist]);

  useEffect(() => {
    const hub = getIndoorBleHub();
    const timer = window.setInterval(() => {
      const p = sensorPrefsRef.current;
      if (!p.sensorDriveEnabled) return;

      const now = Date.now();
      const lastPacketAt = hub.getLastSensorPacketAtMs();
      const noPacket = lastPacketAt > 0 && now - lastPacketAt >= SENSOR_NO_PACKET_FORCE_ZERO_MS;

      const lastValidAt = sensorLastValidRpmAtRef.current;
      const staleRpm = lastValidAt > 0 && now - lastValidAt >= SENSOR_HARD_ZERO_MS;

      if (!noPacket && !staleRpm) return;

      sensorRpmEmaRef.current = null;
      if (noPacket) {
        sensorLastValidRpmRef.current = null;
        sensorLastValidRpmAtRef.current = 0;
      }
      setCurrentRpm(0);
      setEffectiveSpeedKmH(0);
    }, 300);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (sensorCapacitySaveTimerRef.current) {
        clearTimeout(sensorCapacitySaveTimerRef.current);
        sensorCapacitySaveTimerRef.current = null;
      }
    };
  }, []);

  /** 이중화 테스트: URL ?elevation_provider=opentopodata 또는 ?elevation_provider=open-elevation */
  const elevationProvider = typeof window !== 'undefined' ? (() => {
    const p = new URLSearchParams(window.location.search).get('elevation_provider');
    return (p === 'opentopodata' || p === 'open-elevation') ? p : undefined;
  })() : undefined;

  /** A안: OSRM 경로 유지, 표고만 Valhalla. 메뉴 토글 + localStorage; URL `?elevation_engine=valhalla|open` 이 최초 로드 시 우선. */
  const [elevationEngine, setElevationEngine] = useState<'open' | 'valhalla'>(() => {
    if (typeof window === 'undefined') return 'open';
    const q = new URLSearchParams(window.location.search).get('elevation_engine');
    if (q === 'valhalla') return 'valhalla';
    if (q === 'open') return 'open';
    try {
      const s = localStorage.getItem(ELEVATION_ENGINE_STORAGE_KEY);
      if (s === 'valhalla') return 'valhalla';
    } catch {
      /* ignore */
    }
    return 'open';
  });

  const persistElevationEngine = useCallback((v: 'open' | 'valhalla') => {
    setElevationEngine(v);
    try {
      localStorage.setItem(ELEVATION_ENGINE_STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchElevationAlongOsrmPath = async (
    path: any[],
    samples: number,
    mode: TravelMode
  ) => {
    if (elevationEngine === 'valhalla' && isValhallaElevationConfigured()) {
      try {
        return await getValhallaElevationAlongOsrmPath(path, mode, { elevationIntervalM: 30, maxWaypoints: 40 });
      } catch (e) {
        console.warn('[ELEVATION] Valhalla 실패, Open-Elevation으로 폴백', e);
      }
    }
    // 기본 공급자 실패 시 자동으로 대체 공급자를 한 번 더 시도해
    // flat-profile(전부 0m) 폴백으로 바로 떨어지는 확률을 줄인다.
    try {
      return await openElevation.getElevationAlongPath(
        path,
        samples,
        elevationProvider ? { provider: elevationProvider } : undefined
      );
    } catch (primaryErr) {
      // 사용자가 URL 파라미터로 provider를 강제한 경우에는 의도를 존중해 재시도하지 않는다.
      if (elevationProvider) throw primaryErr;
      try {
        console.warn('[ELEVATION] primary provider 실패, opentopodata 재시도', primaryErr);
        return await openElevation.getElevationAlongPath(path, samples, { provider: 'opentopodata' });
      } catch (secondaryErr) {
        console.warn('[ELEVATION] opentopodata 재시도도 실패', secondaryErr);
        throw primaryErr;
      }
    }
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  /** 주행 시간 표시용 단순 형식 (예: 1:25) */
  const formatDurationSimple = (totalSeconds: number) => {
    if (!isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.round((totalSeconds % 3600) / 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
  };

  // Helper to check if current route is saved
  const isCurrentRouteSaved = useCallback(() => {
    if (!origin || !destination) return false;
    return favoriteRoutes.some(saved =>
      saved.origin === origin &&
      saved.destination === destination &&
      saved.waypoints.length === waypoints.length &&
      saved.waypoints.every((wp, i) => wp.name === waypoints[i].name)
    );
  }, [origin, destination, waypoints, favoriteRoutes]);

  const handleToggleFavorite = () => {
    if (!origin || !destination) return;

    const isSaved = isCurrentRouteSaved();

    if (isSaved) {
      // Remove
      const newFavorites = favoriteRoutes.filter(saved => !(
        saved.origin === origin &&
        saved.destination === destination &&
        saved.waypoints.length === waypoints.length &&
        saved.waypoints.every((wp, i) => wp.name === waypoints[i].name)
      ));
      setFavoriteRoutes(newFavorites);
      localStorage.setItem(FAVORITE_ROUTES_STORAGE_KEY, JSON.stringify(newFavorites));
    } else {
      // Add
      if (favoriteRoutes.length >= 5) {
        alert("Maximum 5 routes can be saved. Please remove a route to save a new one.");
        return;
      }

      // Serialize waypoints (정밀도 유지)
      const newWaypoints = waypoints.map(wp => {
        const lat = typeof wp.location.lat === 'function' ? wp.location.lat() : wp.location.lat;
        const lng = typeof wp.location.lng === 'function' ? wp.location.lng() : wp.location.lng;
        return {
          name: wp.name,
          lat: Number(Number(lat).toFixed(8)),
          lng: Number(Number(lng).toFixed(8))
        };
      });

      // OSRM 경로가 있으면 fullGeometry + densified + elevation 저장 → 불러올 때 재호출 없이 주행 가능
      let routePayload: SavedRoute['routePayload'] = undefined;
      if (route && routeSource === 'OSRM' && route.path?.length > 0) {
        const densifiedLatLng: [number, number][] = route.path.map((p: any) => toLatLngPair(p));
        const fullGeom: [number, number][] = lastOsrmDecodedPathRef.current?.length
          ? lastOsrmDecodedPathRef.current.slice()
          : densifiedLatLng.slice();
        const cumulative = computeCumulativeDistances(densifiedLatLng);
        const totalM = cumulative[cumulative.length - 1] ?? 0;
        const elevationSamples: [number, number, number][] = (route.elevation ?? []).map((r: any) => {
          const loc = r.location;
          const lat = typeof loc?.lat === 'function' ? loc.lat() : loc?.lat;
          const lng = typeof loc?.lng === 'function' ? loc.lng() : loc?.lng;
          return [fix8(lat), fix8(lng), Number((Number(r.elevation) || 0).toFixed(3))] as [number, number, number];
        });
        const profile = mode === TravelMode.DRIVING ? 'driving' : mode === TravelMode.BICYCLING ? 'cycling' : 'foot';
        const originSrc = originLocationRef.current ?? route.path[0];
        const destSrc = destLocationRef.current ?? route.path[route.path.length - 1];
        routePayload = {
          schemaVersion: SAVED_ROUTE_PAYLOAD_VERSION,
          provider: 'osrm',
          profile,
          distance: route.distance,
          duration: route.duration,
          fullGeometry: fullGeom,
          densifiedGeometry: densifiedLatLng,
          cumulativeDistances: cumulative.map(d => Number(d.toFixed(2))),
          ...(elevationSamples.length ? { elevationSamples } : {}),
          totalDistanceMeters: Number(totalM.toFixed(2)),
          originLatLng: toLatLngPair(originSrc),
          destLatLng: toLatLngPair(destSrc),
          waypointLatLngs: waypoints.map(wp => toLatLngPair(wp.location)),
          createdAt: Date.now()
        };
      }
      if (!routePayload?.fullGeometry?.length) {
        alert("Only resolved OSRM routes can be saved. Create a route first, then save it.");
        return;
      }

      const newRoute: SavedRoute = {
        id: Date.now().toString(),
        source: 'USER',
        origin,
        destination,
        waypoints: newWaypoints,
        timestamp: Date.now(),
        ...(routePayload && { routePayload })
      };

      const newFavorites = [newRoute, ...favoriteRoutes];
      setFavoriteRoutes(newFavorites);
      localStorage.setItem(FAVORITE_ROUTES_STORAGE_KEY, JSON.stringify(newFavorites));
    }
  };

  const updateFavoriteRoutePayload = useCallback((favoriteId: string, payload: SavedRoutePayload) => {
    setFavoriteRoutes((prev) => {
      const next = prev.map((item) => (
        item.id === favoriteId
          ? {
              ...item,
              routePayload: payload,
              source: item.source === 'DEFAULT' ? ('DEFAULT' as const) : ('USER' as const)
            }
          : item
      ));
      localStorage.setItem(FAVORITE_ROUTES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleLoadFavorite = async (saved: SavedRoute) => {
    setOrigin(saved.origin);
    setDestination(saved.destination);
    // My favorites 로드 시에도 추천 목록 표시 안 함 (맵 클릭과 동일 ref 사용)
    originSetFromMapClickRef.current = true;
    destSetFromMapClickRef.current = true;
    setOriginSuggestions([]);
    setShowOriginSuggestions(false);
    setDestinationSuggestions([]);
    setShowDestinationSuggestions(false);
    const pLoad = saved.routePayload;
    const mkRefPoint = (pair: [number, number] | undefined | null) => {
      if (!pair || pair.length < 2 || !Number.isFinite(pair[0]) || !Number.isFinite(pair[1])) return null;
      const lat = pair[0];
      const lng = pair[1];
      return typeof google !== 'undefined' && google.maps?.LatLng
        ? new google.maps.LatLng(lat, lng)
        : { lat, lng };
    };
    let originSeedLoad = mkRefPoint(pLoad?.originLatLng);
    let destSeedLoad = mkRefPoint(pLoad?.destLatLng);
    if (!originSeedLoad && pLoad?.fullGeometry?.length) {
      const fg = pLoad.fullGeometry;
      originSeedLoad = mkRefPoint(fg[0] as [number, number]);
    }
    if (!destSeedLoad && pLoad?.fullGeometry?.length) {
      const fg = pLoad.fullGeometry;
      destSeedLoad = mkRefPoint(fg[fg.length - 1] as [number, number]);
    }
    originLocationRef.current = originSeedLoad;
    destLocationRef.current = destSeedLoad;
    const restoredWaypoints = saved.waypoints.map(wp => ({
      name: wp.name,
      location: { lat: wp.lat, lng: wp.lng },
    }));
    setWaypoints(restoredWaypoints);
    if (saved.routePayload?.profile) {
      const lockedMode = modeFromProfile(saved.routePayload.profile);
      setLockedRouteProfile(saved.routePayload.profile);
      setMode(lockedMode);
    } else {
      setLockedRouteProfile(null);
    }
    if (saved.routePayload?.fullGeometry?.length) {
      try {
        await restoreRouteFromSavedGeometryRef.current?.(saved);
        return;
      } catch (e) {
        console.warn('[MY_ROUTES] restore failed, falling back to OSRM recalculation', e);
        // 세션 내 폴백만 — localStorage payload 는 보존하여 다음 로드 재시도 가능
      }
    }
    // Legacy/default favorites without fullGeometry: one-time migrate by recalculating and persisting payload.
    const fallbackMode = saved.routePayload?.profile ? modeFromProfile(saved.routePayload.profile) : mode;
    const lockedProfile = profileFromMode(fallbackMode);
    setMode(fallbackMode);
    setLockedRouteProfile(lockedProfile);
    await calculateRoute(fallbackMode, false, saved.origin, saved.destination, restoredWaypoints, saved.id);
  };

  const handleDeleteFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFavorites = favoriteRoutes.filter(r => r.id !== id);
    setFavoriteRoutes(newFavorites);
    localStorage.setItem(FAVORITE_ROUTES_STORAGE_KEY, JSON.stringify(newFavorites));
  };

  // Helper: swap only after nextPano is OK + 150ms delay (방안 A: 검은 화면 방지). onSwapDone 호출 시 스왑 완료(첫 거리뷰 디스플레이 보장용).
  const scheduleSwapAfterOk = useCallback((nextPano: any, _nextIdx: number, doSwap: () => void, onSwapDone?: () => void) => {
    if (USE_CONTINUOUS_SV_DRIVE_THROUGH) {
      doSwap();
      onSwapDone?.();
      return;
    }
    const safelyRemoveListener = (listener: any) => {
      if (!listener) return;
      try {
        if (typeof listener.remove === 'function') {
          listener.remove();
          return;
        }
        const eventApi = (window as any).google?.maps?.event;
        if (eventApi?.removeListener) eventApi.removeListener(listener);
      } catch (e) {
        console.warn('[SV] listener remove skipped due to transient state:', e);
      }
    };
    const runSwap = () => {
      doSwap();
      onSwapDone?.();
    };
    if (pendingSwapFallbackRef.current) {
      clearTimeout(pendingSwapFallbackRef.current);
      pendingSwapFallbackRef.current = null;
    }
    const doSwapWithDelay = () => {
      pendingSwapTimeoutRef.current = null;
      runSwap();
    };
    const FALLBACK_MS = 1500;
    const DELAY_AFTER_OK_MS = 150;
    let listener: any = null;
    pendingSwapFallbackRef.current = setTimeout(() => {
      pendingSwapFallbackRef.current = null;
      safelyRemoveListener(listener);
      runSwap();
    }, FALLBACK_MS);
    listener = nextPano.addListener('status_changed', () => {
      if (nextPano.getStatus() !== 'OK') return;
      if (listener) { safelyRemoveListener(listener); listener = null; }
      if (pendingSwapFallbackRef.current) { clearTimeout(pendingSwapFallbackRef.current); pendingSwapFallbackRef.current = null; }
      pendingSwapTimeoutRef.current = setTimeout(doSwapWithDelay, DELAY_AFTER_OK_MS);
    });
  }, []);

  // Helper function to update panorama atomically (Hybrid Double Buffer). 스왑 완료 시 resolve하여 변경된 경로 거리뷰 디스플레이 보장.
  // 무한 대기 방지: PANORAMA_VIEW_TIMEOUT_MS 초과 시 resolve하여 주행이 반드시 시작되도록 함.
  const setPanoramaView = useCallback((location: any, heading: number): Promise<void> => {
    const inner = new Promise<void>((resolve) => {
      if (!svServiceRef.current) { resolve(); return; }
      if (pendingSwapTimeoutRef.current) {
        clearTimeout(pendingSwapTimeoutRef.current);
        pendingSwapTimeoutRef.current = null;
      }
      if (pendingSwapFallbackRef.current) {
        clearTimeout(pendingSwapFallbackRef.current);
        pendingSwapFallbackRef.current = null;
      }
      getPanoramaWithFallback(svServiceRef.current, { location, radius: 50 }).then(({ data, usedFallback, reason }) => {
        if (!data?.location) {
          // timeout은 응답 지연일 뿐이므로 경고 표시 안 함. no_pano일 때만 "No street view" 표시
          if (reason === 'no_pano') setShowSvWarning(true);
          resolve();
          return;
        }
        setIsUserPano(usedFallback);
        if (USE_CONTINUOUS_SV_DRIVE_THROUGH) {
          const currentPano = panorama1.current;
          if (!currentPano) { resolve(); return; }
          currentPano.setOptions({
            pano: data.location.pano,
            pov: { heading, pitch: 0, zoom: 0 },
            visible: true
          });
          activePanoRef.current = 0;
          setVisiblePanoIdx(0);
          resolve();
          return;
        }
        const currentIdx = activePanoRef.current;
        const nextIdx = currentIdx === 0 ? 1 : 0;
        const currentPano = currentIdx === 0 ? panorama1.current : panorama2.current;
        const nextPano = nextIdx === 0 ? panorama1.current : panorama2.current;

        if (!currentPano || !nextPano) { resolve(); return; }

        const newPanoId = data.location.pano;
        const currentPanoId = currentPano.getPano();

        const doSwap = () => {
          pendingSwapTimeoutRef.current = null;
          activePanoRef.current = nextIdx;
          setVisiblePanoIdx(nextIdx);
        };

        nextPano.setOptions({
          pano: newPanoId,
          pov: { heading, pitch: 0, zoom: 0 },
          visible: true
        });

        scheduleSwapAfterOk(nextPano, nextIdx, doSwap, () => resolve());
      }).catch(() => resolve());
    });
    const timeout = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.warn('[SV] setPanoramaView timeout — proceeding without street view');
        // timeout은 로딩 지연이므로 경고 표시하지 않음. OK 수신 시 status_changed에서 해제됨
        resolve();
      }, PANORAMA_VIEW_TIMEOUT_MS);
    });
    return Promise.race([inner, timeout]);
  }, [scheduleSwapAfterOk]);

  /**
   * 거리뷰 표시: 내부적으로 계산된 각도(heading)를 적용한 뒤 스왑하여 보여줌.
   * isUserPhoto: 사용자 제작 이미지 여부(배지 표시용).
   * 스왑 완료 시 resolve하여 변경된 경로 거리뷰 디스플레이 보장.
   * 무한 대기 방지: PANORAMA_VIEW_TIMEOUT_MS 초과 시 resolve하여 주행이 반드시 시작되도록 함.
   */
  const setPanoramaViewByPanoId = useCallback((panoId: string, heading: number, isUserPhoto?: boolean): Promise<void> => {
    const inner = new Promise<void>((resolve) => {
      setIsUserPano(!!isUserPhoto);
      if (pendingSwapTimeoutRef.current) {
        clearTimeout(pendingSwapTimeoutRef.current);
        pendingSwapTimeoutRef.current = null;
      }
      if (pendingSwapFallbackRef.current) {
        clearTimeout(pendingSwapFallbackRef.current);
        pendingSwapFallbackRef.current = null;
      }
      if (USE_CONTINUOUS_SV_DRIVE_THROUGH) {
        const currentPano = panorama1.current;
        if (!currentPano) { resolve(); return; }
        const currentPanoId = currentPano.getPano?.();
        if (currentPanoId !== panoId) {
          currentPano.setOptions({ pano: panoId, pov: { heading, pitch: 0, zoom: 0 }, visible: true });
        } else {
          currentPano.setPov({ heading, pitch: 0, zoom: 0 });
        }
        activePanoRef.current = 0;
        setVisiblePanoIdx(0);
        resolve();
        return;
      }
      const currentIdx = activePanoRef.current;
      const nextIdx = currentIdx === 0 ? 1 : 0;
      const currentPano = currentIdx === 0 ? panorama1.current : panorama2.current;
      const nextPano = nextIdx === 0 ? panorama1.current : panorama2.current;
      if (!currentPano || !nextPano) { resolve(); return; }
      const currentPanoId = currentPano.getPano();

      const doSwap = () => {
        pendingSwapTimeoutRef.current = null;
        activePanoRef.current = nextIdx;
        setVisiblePanoIdx(nextIdx);
      };

      // 같은 파노라마: heading 차이 1.5° 미만이면 무시, 1.5° 이상이면 POV만 갱신(스왑 없이) → 멈춤 감소
      if (currentPanoId === panoId) {
        const currentPov = currentPano.getPov?.();
        const curH = currentPov?.heading ?? 0;
        const diff = Math.abs(normalizeAngleDiff(curH - heading));
        if (diff < 1.5) { resolve(); return; }
        currentPano.setPov({ heading, pitch: 0, zoom: 0 });
        resolve();
        return;
      }

      nextPano.setOptions({ pano: panoId, pov: { heading, pitch: 0, zoom: 0 }, visible: true });
      scheduleSwapAfterOk(nextPano, nextIdx, doSwap, () => resolve());
    });
    const timeout = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.warn('[SV] setPanoramaViewByPanoId timeout — proceeding without street view');
        // timeout은 로딩 지연이므로 경고 표시하지 않음. OK 수신 시 status_changed에서 해제됨
        resolve();
      }, PANORAMA_VIEW_TIMEOUT_MS);
    });
    return Promise.race([inner, timeout]);
  }, [scheduleSwapAfterOk]);

  /** [Phase 2] Pre-fetch: Multi-pass(50m ±40° → 120m 제한없음) 후 후보 수집, 점수로 1개 선택. [Phase 5] sampleCount 반환. */
  const preFetchStreetViewData = useCallback(async (
    path: any[],
    onProgress: (k: number, n: number) => void,
    options?: { fromDistanceM?: number; maxDistanceM?: number; intervalM?: number }
  ): Promise<{ panoData: PanoDataItem[]; sampleCount: number }> => {
    if (!svServiceRef.current || !path.length) return { panoData: [], sampleCount: 0 };
    const cumDist: number[] = [0];
    for (let i = 1; i < path.length; i++) {
      cumDist[i] = cumDist[i - 1] + computeDistanceBetween(path[i - 1], path[i]);
    }
    const totalM = cumDist[path.length - 1];
    const intervalM = options?.intervalM ?? 10;
    const fromDistanceM = options?.fromDistanceM ?? 0;
    const maxDistanceM = options?.maxDistanceM ?? totalM;
    const samples: number[] = [];
    for (let d = fromDistanceM; d <= Math.min(totalM, maxDistanceM); d += intervalM) {
      let i = 0;
      while (i < path.length - 1 && cumDist[i + 1] < d) i++;
      samples.push(Math.min(i, path.length - 1));
    }
    const panoData: PanoDataItem[] = [];
    const n = samples.length;
    for (let k = 0; k < n; k++) {
      const pathIndex = samples[k];
      const pathPoint = path[pathIndex];
      const pathNext = path[Math.min(pathIndex + 10, path.length - 1)];
      const driveHeading = computeHeading(pathPoint, pathNext);
      const candidates: { item: PanoDataItem; maxD: number }[] = [];

      const pass1 = await findStreetViewInDirection(
        svServiceRef.current,
        pathPoint,
        pathNext,
        pathIndex,
        path,
        SV_PASS1_RADIUS_M,
        SV_PASS1_MAX_ANGLE_DEG
      );
      if (pass1) candidates.push({ item: pass1, maxD: SV_PASS1_RADIUS_M });

      if (candidates.length === 0) {
        const pass1Relaxed = await findStreetViewInDirection(
          svServiceRef.current,
          pathPoint,
          pathNext,
          pathIndex,
          path,
          SV_PASS1_RADIUS_M,
          SV_PASS1_RELAXED_ANGLE_DEG
        );
        if (pass1Relaxed) candidates.push({ item: pass1Relaxed, maxD: SV_PASS1_RADIUS_M });
      }

      if (candidates.length === 0) {
        const pass2 = await findStreetView(svServiceRef.current, pathPoint, SV_PASS2_RADIUS_M);
        if (pass2?.data?.location?.pano) {
          const desc = pass2.data.location?.description ?? '';
          if (!SV_INDOOR_KEYWORDS.test(desc)) {
            const heading = computeHeading(pathPoint, pathNext);
            candidates.push({
              item: {
                pathIndex,
                panoId: pass2.data.location.pano,
                location: pass2.data.location.latLng,
                heading,
                isUserPhoto: pass2.usedFallback,
                description: desc || undefined
              },
              maxD: SV_PASS2_RADIUS_M
            });
          }
        }
      }

      const filtered = candidates.filter(c => !c.item.description || !SV_INDOOR_KEYWORDS.test(c.item.description));
      let best: PanoDataItem | null = null;
      let bestScore = -1;
      for (const { item, maxD } of filtered) {
        const d = computeDistanceBetween(pathPoint, item.location);
        const bearingToPano = computeHeading(pathPoint, item.location);
        const diff = Math.abs(normalizeAngleDiff(bearingToPano - driveHeading));
        const score =
          SV_SCORE_DIST_WEIGHT * (1 - Math.min(d, maxD) / maxD) +
          SV_SCORE_ANGLE_WEIGHT * (1 - Math.min(diff, SV_SCORE_ANGLE_DENOM_DEG) / SV_SCORE_ANGLE_DENOM_DEG);
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }
      if (best) panoData.push(best);
      onProgress(k + 1, n);
      if (k < n - 1) await new Promise(r => setTimeout(r, 80));
    }
    return { panoData, sampleCount: n };
  }, []);

  // Find panoData item with largest pathIndex <= current path index
  const getPanoDataForIndex = useCallback((panoData: PanoDataItem[], pathIndex: number): PanoDataItem | null => {
    if (!panoData.length) return null;
    let best: PanoDataItem | null = null;
    for (const p of panoData) {
      if (p.pathIndex <= pathIndex && (best === null || p.pathIndex > best.pathIndex)) best = p;
    }
    return best ?? panoData[0];
  }, []);

  // 사용자 현재 위치 조회 (Geolocation API) — 지도 노출 전에 요청해 초기 중심에 반영
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* 거부/오류 시 기본(서울) 유지 */ },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // 2초 후 맵 영역 노출 — 타일 로드 문제 방지를 위해 먼저 노출 후 맵 생성
  useEffect(() => {
    const t = window.setTimeout(() => setMapRevealed(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // 인트로(지도 로드) 종료 후 "Please click 2 points on the road." 3초간 표시
  const hasShownClickHintRef = useRef(false);
  useEffect(() => {
    if (!isMapReady) {
      hasShownClickHintRef.current = false;
      return;
    }
    if (hasShownClickHintRef.current) return;
    hasShownClickHintRef.current = true;
    setShowClickTwoPointsHint(true);
    const t = window.setTimeout(() => setShowClickTwoPointsHint(false), 3000);
    return () => clearTimeout(t);
  }, [isMapReady]);

  // start/end 둘 다 있을 때 car·bike·foot 버튼 1초간 순차 20% 확대 3회 반복 (맵 START/END 재지정·Delete Route 시 hasShownModePulseRef 리셋으로 재실행 가능)
  useEffect(() => {
    if (!origin || !destination || hasShownModePulseRef.current) return;
    hasShownModePulseRef.current = true;
    const step = 333; // 1초 사이클
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      timeouts.push(window.setTimeout(() => setModeButtonPulseIndex(0), cycle * 1000));
      timeouts.push(window.setTimeout(() => setModeButtonPulseIndex(1), cycle * 1000 + step));
      timeouts.push(window.setTimeout(() => setModeButtonPulseIndex(2), cycle * 1000 + step * 2));
    }
    timeouts.push(window.setTimeout(() => setModeButtonPulseIndex(-1), 3000));
    return () => timeouts.forEach((t) => clearTimeout(t));
  }, [origin, destination]);

  // Google Map 베이스맵 생성: Maps API 로드 + mapRevealed 후, mapRef 가 잡힐 때까지 rAF 재시도 (Android WebView에서 ref 타이밍 레이스 방지)
  useEffect(() => {
    if (!isMapsApiLoaded || !mapRevealed || googleMapRef.current) return;

    let cancelled = false;
    let rafId = 0;
    let attempts = 0;
    const maxAttempts = 180; // ~3s @60fps — 인트로(2s) 직후 레이아웃 지연까지 커버

    const tryCreateMap = () => {
      if (cancelled || googleMapRef.current) return;
      const el = mapRef.current;
      if (el) {
        try {
          const map = new google.maps.Map(el, {
            center: { lat: 37.5512, lng: 126.9882 },
            zoom: 14,
            mapTypeId: mapTypeRef.current,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            zoomControl: false,
            cameraControl: false,
            scaleControl: true,
            scaleControlOptions: { position: google.maps.ControlPosition.BOTTOM_CENTER },
            rotateControl: false,
            tiltControl: false,
            clickableIcons: false, // 상점·POI 이름은 보이기만 하고 클릭 시 구글맵으로 연결되지 않음
          });
          googleMapRef.current = map;
          map.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (e.latLng) handleLocationClickRef.current(e.latLng.lat(), e.latLng.lng());
          });
          if (!cancelled) setIsMapReady(true);
        } catch (err) {
          console.error('[Google Map init]', err);
          if (!cancelled) {
            setGoogleMapsBootstrapError((prev) => prev ?? 'Google 지도를 초기화하지 못했습니다.');
            setIsMapReady(true);
          }
        }
        return;
      }
      attempts += 1;
      if (attempts >= maxAttempts) {
        console.error('[Google Map init] mapRef not ready after', maxAttempts, 'frames');
        if (!cancelled) {
          setGoogleMapsBootstrapError((prev) => prev ?? '지도 영역을 준비하지 못했습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요.');
          setIsMapReady(true);
        }
        return;
      }
      rafId = window.requestAnimationFrame(tryCreateMap);
    };

    rafId = window.requestAnimationFrame(tryCreateMap);

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      googleMapRef.current = null;
      setIsMapReady(false);
    };
  }, [mapRevealed, isMapsApiLoaded]);

  // 사용자 위치를 받으면 지도 중심을 해당 위치로 이동
  useEffect(() => {
    if (!isMapReady || !userLocation || !googleMapRef.current) return;
    googleMapRef.current.panTo(userLocation);
    googleMapRef.current.setZoom(14);
  }, [isMapReady, userLocation]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncOrientation = () => {
      setIsPortrait(window.innerHeight >= window.innerWidth);
    };
    syncOrientation();
    window.addEventListener('resize', syncOrientation);
    window.addEventListener('orientationchange', syncOrientation);
    return () => {
      window.removeEventListener('resize', syncOrientation);
      window.removeEventListener('orientationchange', syncOrientation);
    };
  }, []);

  // 출발지 입력 디바운스 → Nominatim 추천 목록 (맵 클릭/스왑으로 설정된 경우 추천 목록 표시 안 함)
  useEffect(() => {
    if (originSetFromMapClickRef.current) {
      originSetFromMapClickRef.current = false;
      setOriginSuggestions([]);
      setShowOriginSuggestions(false);
      setOriginHighlightIndex(-1);
      return;
    }
    if (originSetFromSwapRef.current) {
      originSetFromSwapRef.current = false;
      setShowOriginSuggestions(false);
      setOriginHighlightIndex(-1);
      return;
    }
    const q = origin.trim();
    if (q.length < 2) {
      setOriginSuggestions([]);
      setShowOriginSuggestions(false);
      return;
    }
    if (originSuggestDebounceRef.current) clearTimeout(originSuggestDebounceRef.current);
    originSuggestDebounceRef.current = window.setTimeout(() => {
      const reqId = ++originSuggestReqIdRef.current;
      nominatim.searchSuggestions(q, 5).then((list) => {
        if (reqId !== originSuggestReqIdRef.current) return;
        setOriginSuggestions(list);
        if (!originJustSelectedRef.current) setShowOriginSuggestions(list.length > 0);
        originJustSelectedRef.current = false;
        setOriginHighlightIndex(-1);
      }).catch(() => {
        if (reqId === originSuggestReqIdRef.current) setOriginSuggestions([]);
      });
    }, 0);
    return () => {
      if (originSuggestDebounceRef.current) clearTimeout(originSuggestDebounceRef.current);
    };
  }, [origin]);

  // 도착지 입력 디바운스 → Nominatim 추천 목록 (맵 클릭/스왑으로 설정된 경우 추천 목록 표시 안 함)
  useEffect(() => {
    if (destSetFromMapClickRef.current) {
      destSetFromMapClickRef.current = false;
      setDestinationSuggestions([]);
      setShowDestinationSuggestions(false);
      setDestinationHighlightIndex(-1);
      return;
    }
    if (destSetFromSwapRef.current) {
      destSetFromSwapRef.current = false;
      setShowDestinationSuggestions(false);
      setDestinationHighlightIndex(-1);
      return;
    }
    const q = destination.trim();
    if (q.length < 2) {
      setDestinationSuggestions([]);
      setShowDestinationSuggestions(false);
      return;
    }
    if (destSuggestDebounceRef.current) clearTimeout(destSuggestDebounceRef.current);
    destSuggestDebounceRef.current = window.setTimeout(() => {
      const reqId = ++destSuggestReqIdRef.current;
      nominatim.searchSuggestions(q, 5).then((list) => {
        if (reqId !== destSuggestReqIdRef.current) return;
        setDestinationSuggestions(list);
        if (!destJustSelectedRef.current) setShowDestinationSuggestions(list.length > 0);
        destJustSelectedRef.current = false;
        setDestinationHighlightIndex(-1);
      }).catch(() => {
        if (reqId === destSuggestReqIdRef.current) setDestinationSuggestions([]);
      });
    }, 0);
    return () => {
      if (destSuggestDebounceRef.current) clearTimeout(destSuggestDebounceRef.current);
    };
  }, [destination]);

  // 상단 장소 검색 디바운스 → Nominatim 추천 (패널 접힘 시 요청·표시 안 함)
  useEffect(() => {
    if (!searchExpanded) {
      setPlaceSearchSuggestions([]);
      setShowPlaceSearchSuggestions(false);
      setPlaceSearchHighlightIndex(-1);
      return;
    }
    const q = searchTerm.trim();
    if (q.length < 2) {
      setPlaceSearchSuggestions([]);
      setShowPlaceSearchSuggestions(false);
      setPlaceSearchHighlightIndex(-1);
      return;
    }
    if (placeSuggestDebounceRef.current) clearTimeout(placeSuggestDebounceRef.current);
    placeSuggestDebounceRef.current = window.setTimeout(() => {
      const reqId = ++placeSuggestReqIdRef.current;
      nominatim.searchSuggestions(q, PLACE_SEARCH_SUGGEST_LIMIT).then((list) => {
        if (reqId !== placeSuggestReqIdRef.current) return;
        setPlaceSearchSuggestions(list);
        if (!placeJustSelectedRef.current) setShowPlaceSearchSuggestions(list.length > 0);
        placeJustSelectedRef.current = false;
        setPlaceSearchHighlightIndex(-1);
      }).catch(() => {
        if (reqId === placeSuggestReqIdRef.current) setPlaceSearchSuggestions([]);
      });
    }, PLACE_SEARCH_DEBOUNCE_MS);
    return () => {
      if (placeSuggestDebounceRef.current) clearTimeout(placeSuggestDebounceRef.current);
    };
  }, [searchTerm, searchExpanded]);

  // 맵·다른 콘트롤 클릭 시 추천 목록 닫기
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const el = routeInputContainerRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setShowOriginSuggestions(false);
        setShowDestinationSuggestions(false);
        setOriginHighlightIndex(-1);
        setDestinationHighlightIndex(-1);
      }
      const searchEl = searchBarContainerRef.current;
      if (searchEl && e.target instanceof Node && !searchEl.contains(e.target)) {
        setShowPlaceSearchSuggestions(false);
        setPlaceSearchHighlightIndex(-1);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // 좌측 하단 "Google 지도에서 이 지역 열기" 링크 비활성화 (클릭해도 외부로 열리지 않도록)
  useEffect(() => {
    const container = mapRef.current;
    if (!container || !isMapReady) return;
    const disableGoogleMapsLink = () => {
      const anchors = container.querySelectorAll<HTMLAnchorElement>(
        'a[href*="google.com/maps"], a[href*="maps.google.com"], a[title*="이 지역 열기"], a[title*="Open this area"]'
      );
      anchors.forEach((a: HTMLAnchorElement) => {
        a.addEventListener('click', (e: MouseEvent) => e.preventDefault(), { capture: true });
        a.style.pointerEvents = 'none';
        a.style.cursor = 'default';
      });
    };
    disableGoogleMapsLink();
    const t1 = window.setTimeout(disableGoogleMapsLink, 500);
    const t2 = window.setTimeout(disableGoogleMapsLink, 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isMapReady]);

  // 맵 컨테이너 리사이즈 시(상/하 전환·미니맵) Google Map resize 이벤트
  useEffect(() => {
    const el = mapRef.current;
    if (!el || !googleMapRef.current) return;
    const ro = new ResizeObserver(() => {
      triggerMapResize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapRevealed, isMapReady, triggerMapResize]);

  const resolveNearestAddress = useCallback(async (lat: number, lng: number): Promise<string> => {
    const sanitize = (v?: string | null): string | null => {
      if (!v) return null;
      const t = v.trim();
      if (!t || isCoordinateLabel(t) || t === MAP_PICK_FALLBACK_ADDRESS || t === MAP_PICK_GENERIC_ADDRESS) return null;
      return t;
    };
    let bestCandidate: string | null = null;
    try {
      const direct = await nominatim.reverse(lat, lng);
      const s = sanitize(direct.formatted_address);
      if (s) return s;
    } catch {
      // continue
    }
    // 중심점이 수면/하상으로 찍히는 경우를 위해 주변 오프셋 탐색(약 40m~700m, 대각 포함)
    const offsets: Array<[number, number]> = [
      [0.00035, 0], [-0.00035, 0], [0, 0.00035], [0, -0.00035],
      [0.00035, 0.00035], [0.00035, -0.00035], [-0.00035, 0.00035], [-0.00035, -0.00035],
      [0.00075, 0], [-0.00075, 0], [0, 0.00075], [0, -0.00075],
      [0.00075, 0.00075], [0.00075, -0.00075], [-0.00075, 0.00075], [-0.00075, -0.00075],
      [0.0015, 0], [-0.0015, 0], [0, 0.0015], [0, -0.0015],
      [0.0015, 0.0015], [0.0015, -0.0015], [-0.0015, 0.0015], [-0.0015, -0.0015],
      [0.003, 0], [-0.003, 0], [0, 0.003], [0, -0.003],
      [0.005, 0], [-0.005, 0], [0, 0.005], [0, -0.005],
    ];
    for (const [dLat, dLng] of offsets) {
      try {
        const r = await nominatim.reverse(lat + dLat, lng + dLng);
        const s = sanitize(r.formatted_address);
        if (s) {
          // 가장 먼저 잡히는 도로명/지번 주소를 우선 반환
          return s;
        }
        if (r.formatted_address && !isCoordinateLabel(r.formatted_address)) {
          bestCandidate = bestCandidate ?? r.formatted_address.trim();
        }
      } catch {
        // try next
      }
    }
    // 최후 보정: 도로명까지 못 잡아도 zoom을 낮춰 행정구역 단위 주소를 확보한다.
    for (const z of [16, 14, 12, 10, 8, 6]) {
      try {
        const r = await nominatim.reverse(lat, lng, { zoom: z });
        const s = sanitize(r.formatted_address);
        if (s) return s;
        if (r.formatted_address && !isCoordinateLabel(r.formatted_address)) {
          bestCandidate = bestCandidate ?? r.formatted_address.trim();
        }
      } catch {
        // try next zoom
      }
    }
    // 완전 실패 직전: 좌표/임시문구가 아닌 후보가 하나라도 있으면 그것을 쓴다.
    if (bestCandidate && !isPendingMapAddress(bestCandidate)) return bestCandidate;
    // 그래도 실패하면 최종 일반 주소로 마감(좌표/선택한 위치/확인중 문구는 남기지 않음).
    return MAP_PICK_GENERIC_ADDRESS;
  }, []);

  // 클릭한 위치(맵/경로) → 즉시 인포윈도우 표시 후, 주소·표고 비동기 채우기 (지연 개선)
  useEffect(() => {
    if (typeof (window as any).google === 'undefined' || !(window as any).google.maps?.LatLng) return;
    const g = (window as any).google;
    handleLocationClickRef.current = (lat: number, lng: number) => {
      const location = new g.maps.LatLng(lat, lng);
      // 1) 즉시 팝업 표시 (체감 지연 제거)
      setClickedLocation({
        lat,
        lng,
        name: 'Loading...',
        address: MAP_PICK_FALLBACK_ADDRESS,
        elevation: null,
        location,
      });
      // 2) 주소 조회 → 도착 시 해당 클릭이 현재 표시 중일 때만 갱신
      resolveNearestAddress(lat, lng)
        .then((name) => {
          setClickedLocation((prev) => {
            if (!prev || prev.lat !== lat || prev.lng !== lng) return prev;
            return { ...prev, name, address: name };
          });
        });
      // 3) 표고 조회 → 도착 시 해당 클릭이 현재 표시 중일 때만 갱신
      openElevation
        .getElevationAlongPath([{ lat, lng }], 1, elevationProvider ? { provider: elevationProvider } : undefined)
        .then((r) => r.results[0]?.elevation ?? null)
        .catch(() => null)
        .then((elevation) => {
          setClickedLocation((prev) => {
            if (!prev || prev.lat !== lat || prev.lng !== lng) return prev;
            return { ...prev, elevation };
          });
        });
    };
  }, [isMapsApiLoaded, elevationProvider, resolveNearestAddress]);

  // Google Maps API: Map(베이스맵) + Street View
  useEffect(() => {
    if ((window as any).google?.maps?.Map) {
      setIsMapsApiLoaded(true);
      return;
    }
    // Vite의 `define` 주입이 Android 빌드 과정에서 누락될 수 있어,
    // 런타임(윈도우/메타태그)에서 2차로 키를 찾도록 보강합니다.
    const apiKey =
      (process.env as any)?.GOOGLE_MAPS_API_KEY
      ?? (window as any).__GOOGLE_MAPS_API_KEY__
      ?? (typeof document !== 'undefined'
        ? (document.querySelector('meta[name="GOOGLE_MAPS_API_KEY"]') as HTMLMetaElement | null)?.content
        : undefined)
      ?? '';
    if (!apiKey) {
      console.warn('[GoogleMaps] GOOGLE_MAPS_API_KEY is missing. maps script not loaded.');
      setGoogleMapsBootstrapError('GOOGLE_MAPS_API_KEY 가 빌드에 없습니다. Android 빌드 시 키 주입을 확인하세요.');
      setIsMapReady(true);
      return;
    }
    // Google이 키/제한/과금 문제로 지도 로드를 거부할 때 호출됨 → Logcat에서 원인 추적용
    (window as any).gm_authFailure = () => {
      console.error(
        '[GoogleMaps] gm_authFailure: Cloud Console에서 (1) Maps JavaScript API·Street View 활성화 (2) 결제 연결 (3) 앱 키 제한에 https://localhost/* 추가 를 확인하세요. (Capacitor WebView 출처는 보통 localhost)'
      );
      setGoogleMapsBootstrapError('Google Maps 인증 실패(gm_authFailure). 콘솔/Cloud 설정을 확인하세요.');
      setIsMapReady(true);
    };
    const callbackName = '__cycleSvApiReady';
    (window as any)[callbackName] = () => {
      (window as any)[callbackName] = null;
      setIsMapsApiLoaded(true);
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      console.error('[GoogleMaps] script onerror — 네트워크 또는 CSP 차단 가능');
      setGoogleMapsBootstrapError('Google Maps 스크립트를 불러오지 못했습니다. 네트워크를 확인하세요.');
      setIsMapReady(true);
    };
    document.head.appendChild(script);
  }, []);

  // Android WebView에서 간헐적으로 발생하는 Google Maps event race를 방어/계측
  useEffect(() => {
    const g = (window as any).google;
    const eventApi = g?.maps?.event;
    if (!isMapsApiLoaded || !eventApi || eventApi.__cyclePatched) return;

    const originalTrigger = typeof eventApi.trigger === 'function' ? eventApi.trigger.bind(eventApi) : null;
    const originalRemoveListener = typeof eventApi.removeListener === 'function'
      ? eventApi.removeListener.bind(eventApi)
      : null;

    if (originalTrigger) {
      eventApi.trigger = (instance: any, eventName: string, ...args: any[]) => {
        if (!instance) {
          console.warn('[GMapsEventPatch] skip trigger: missing instance', { eventName });
          return;
        }
        try {
          return originalTrigger(instance, eventName, ...args);
        } catch (e) {
          console.warn('[GMapsEventPatch] trigger failed', {
            eventName,
            hasGetDiv: typeof instance?.getDiv === 'function',
            error: e,
          });
          return;
        }
      };
    }

    if (originalRemoveListener) {
      eventApi.removeListener = (listener: any) => {
        if (!listener) return;
        try {
          return originalRemoveListener(listener);
        } catch (e) {
          console.warn('[GMapsEventPatch] removeListener failed', e);
          return;
        }
      };
    }

    eventApi.__cyclePatched = true;
  }, [isMapsApiLoaded]);

  // 주행 마커 이미지 프리로드 → base64 data URL (SVG 내부 참조용, data URI SVG는 외부 URL 로드 불가)
  useEffect(() => {
    if (cyclingMarkerDataUrlRef.current) return;
    fetch('/cycling_position_marker.png')
      .then((r) => r.blob())
      .then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => { cyclingMarkerDataUrlRef.current = reader.result as string; };
        reader.readAsDataURL(blob);
      })
      .catch(() => { });
  }, []);

  // Street View init (Panorama + Service) when Google loaded and SV divs exist
  useEffect(() => {
    if (!isMapsApiLoaded || !svRef1.current || panorama1.current) return;
    if (!USE_CONTINUOUS_SV_DRIVE_THROUGH && !svRef2.current) return;
    const svOptions = { visible: true, enableCloseButton: false, disableDefaultUI: true, clickToGo: false, motionTracking: false, motionTrackingControl: false, pov: { heading: 0, pitch: 0, zoom: 0 } };
    panorama1.current = new google.maps.StreetViewPanorama(svRef1.current, svOptions);
    if (USE_CONTINUOUS_SV_DRIVE_THROUGH) {
      panorama2.current = null;
      activePanoRef.current = 0;
      setVisiblePanoIdx(0);
    } else {
      panorama2.current = new google.maps.StreetViewPanorama(svRef2.current, svOptions);
    }
    svServiceRef.current = new google.maps.StreetViewService();
    const handleStatus = () => {
      const currentPano = activePanoRef.current === 0 ? panorama1.current : panorama2.current;
      if (currentPano) setSvStatus(currentPano.getStatus());
      // OK 수신 시 경고 즉시 해제. 양쪽 파노라마 모두 확인(스왑 직전에 로드된 쪽이 OK여도 해제)
      if (panorama1.current?.getStatus() === 'OK' || panorama2.current?.getStatus?.() === 'OK') {
        setShowSvWarning(false);
      }
    };
    panorama1.current.addListener('status_changed', handleStatus);
    panorama2.current?.addListener?.('status_changed', handleStatus);
  }, [isMapsApiLoaded]);

  useEffect(() => {
    simulationActiveRef.current = simulation.isActive;
  }, [simulation.isActive]);

  useEffect(() => {
    musicOnRef.current = musicOn;
  }, [musicOn]);

  // Initialize AdMob (Android only). Manifest already has APPLICATION_ID.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!Capacitor.isNativePlatform()) return;
      try {
        await AdMob.initialize();
        if (cancelled) return;
        setAdmobReady(true);
      } catch (e) {
        console.warn('[AdMob] initialize failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Android 하드웨어 뒤로가기: 오버레이 역순 닫기 → 루트에서 2회 누르면 종료
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    const isAppRootUi = (s: typeof androidBackStateRef.current) =>
      !s.rewardOfferModalStage &&
      s.maxRideLimitMessage == null &&
      s.rideLimitMessage == null &&
      !s.showAbout &&
      !s.sensorsModalOpen &&
      !s.bikeProfileModalOpen &&
      !s.menuOpen &&
      !s.searchExpanded &&
      !s.hasClickedLocation &&
      !s.showOriginSuggestions &&
      !s.showDestinationSuggestions &&
      !s.showPlaceSearchSuggestions &&
      !s.countdownActive &&
      !s.historyExpanded &&
      s.routeSettingsPanelExpanded &&
      s.routeInputExpanded &&
      (!s.hasRoute || s.elevationExpanded) &&
      !s.streetViewFullScreen;

    let listenerHandle: PluginListenerHandle | undefined;

    void CapacitorApp.addListener('backButton', () => {
      const s = androidBackStateRef.current;

      if (s.rewardOfferModalStage) {
        lastAndroidExitPressRef.current = 0;
        setRewardOfferModalStage(null);
        return;
      }
      if (s.maxRideLimitMessage != null) {
        lastAndroidExitPressRef.current = 0;
        setMaxRideLimitMessage(null);
        return;
      }
      if (s.rideLimitMessage != null) {
        lastAndroidExitPressRef.current = 0;
        setRideLimitMessage(null);
        return;
      }
      if (s.showAbout) {
        lastAndroidExitPressRef.current = 0;
        setShowAbout(false);
        return;
      }
      if (s.sensorsModalOpen) {
        lastAndroidExitPressRef.current = 0;
        setSensorsModalOpen(false);
        return;
      }
      if (s.bikeProfileModalOpen) {
        lastAndroidExitPressRef.current = 0;
        bikeProfilePromptSuppressedRef.current = true;
        setBikeProfileModalOpen(false);
        return;
      }
      if (s.menuOpen) {
        lastAndroidExitPressRef.current = 0;
        setMenuOpen(false);
        setMenuView('list');
        return;
      }
      if (s.searchExpanded && s.showPlaceSearchSuggestions) {
        lastAndroidExitPressRef.current = 0;
        setShowPlaceSearchSuggestions(false);
        setPlaceSearchHighlightIndex(-1);
        return;
      }
      if (s.searchExpanded) {
        lastAndroidExitPressRef.current = 0;
        setSearchExpanded(false);
        return;
      }
      if (s.hasClickedLocation) {
        lastAndroidExitPressRef.current = 0;
        setClickedLocation(null);
        return;
      }
      if (s.showOriginSuggestions) {
        lastAndroidExitPressRef.current = 0;
        setShowOriginSuggestions(false);
        return;
      }
      if (s.showDestinationSuggestions) {
        lastAndroidExitPressRef.current = 0;
        setShowDestinationSuggestions(false);
        return;
      }
      if (s.countdownActive) {
        lastAndroidExitPressRef.current = 0;
        setCountdown(null);
        countdownDoneRef.current = null;
        return;
      }
      if (s.streetViewFullScreen) {
        lastAndroidExitPressRef.current = 0;
        setIsSvFullScreen(false);
        return;
      }
      if (s.historyExpanded) {
        lastAndroidExitPressRef.current = 0;
        setHistoryExpanded(false);
        return;
      }
      if (!s.routeSettingsPanelExpanded && s.routeInputExpanded) {
        lastAndroidExitPressRef.current = 0;
        setRouteSettingsPanelExpanded(true);
        return;
      }
      if (!s.routeInputExpanded) {
        lastAndroidExitPressRef.current = 0;
        setRouteInputExpanded(true);
        return;
      }
      if (s.hasRoute && !s.elevationExpanded) {
        lastAndroidExitPressRef.current = 0;
        setElevationExpanded(true);
        return;
      }

      if (isAppRootUi(s)) {
        const now = Date.now();
        if (
          lastAndroidExitPressRef.current > 0 &&
          now - lastAndroidExitPressRef.current < ANDROID_EXIT_DOUBLE_BACK_MS
        ) {
          void CapacitorApp.exitApp();
          return;
        }
        lastAndroidExitPressRef.current = now;
        setAndroidExitHintVisible(true);
        if (androidExitHintTimeoutRef.current) {
          clearTimeout(androidExitHintTimeoutRef.current);
        }
        androidExitHintTimeoutRef.current = window.setTimeout(() => {
          setAndroidExitHintVisible(false);
          androidExitHintTimeoutRef.current = null;
        }, 2500);
        return;
      }

      lastAndroidExitPressRef.current = 0;
    }).then((h) => {
      listenerHandle = h;
    });

    return () => {
      if (androidExitHintTimeoutRef.current) {
        clearTimeout(androidExitHintTimeoutRef.current);
        androidExitHintTimeoutRef.current = null;
      }
      void listenerHandle?.remove();
    };
  }, []);

  // Interstitial: show once when 실제 주행(simulation) 종료 시점에만.
  useEffect(() => {
    if (!admobReady) return;
    if (!Capacitor.isNativePlatform()) return;

    const prevSimActive = lastSimulationActiveRef.current;
    lastSimulationActiveRef.current = simulation.isActive;
    lastAppPhaseRef.current = appPhase;

    // Session start: prepare (주행 시작 시)
    if (simulation.isActive && !prevSimActive) {
      interstitialShownRef.current = false;
      interstitialPreparedRef.current = false;
      interstitialPreparePromiseRef.current = AdMob.prepareInterstitial({
        adId: ADMOB_INTERSTITIAL_AD_UNIT_ID,
        immersiveMode: true,
      })
        .then(() => { interstitialPreparedRef.current = true; })
        .catch((e) => {
          interstitialPreparePromiseRef.current = null;
          interstitialPreparedRef.current = false;
          console.warn('[AdMob] interstitial prepare failed', e);
        });
    }

    // Session end: show only if 실제로 주행하다가(simActive=true) 멈추고, appPhase가 IDLE로 종료됐을 때
    if (!simulation.isActive && prevSimActive && appPhase === 'IDLE' && !interstitialShownRef.current) {
      const run = async () => {
        try {
          if (!interstitialPreparedRef.current) {
            // If prepare is still in-flight, wait for it; otherwise try once more.
            if (interstitialPreparePromiseRef.current) {
              await interstitialPreparePromiseRef.current;
            }

            if (!interstitialPreparedRef.current) {
              interstitialPreparePromiseRef.current = AdMob.prepareInterstitial({
                adId: ADMOB_INTERSTITIAL_AD_UNIT_ID,
                immersiveMode: true,
              })
                .then(() => { interstitialPreparedRef.current = true; })
                .catch((e) => {
                  interstitialPreparePromiseRef.current = null;
                  interstitialPreparedRef.current = false;
                  console.warn('[AdMob] interstitial prepare (end) failed', e);
                });
              await interstitialPreparePromiseRef.current;
            }
          }

          await AdMob.showInterstitial();
          interstitialShownRef.current = true;
        } catch (e) {
          console.warn('[AdMob] interstitial failed', e);
        } finally {
          interstitialPreparePromiseRef.current = null;
        }
      };
      void run();
    }
  }, [admobReady, appPhase, simulation.isActive]);

  // immersive(내비 숨김)이면 전면광고 닫기 컨트롤이 잘릴 수 있어, 노출 중에만 시스템 바를 연다. 닫힌 뒤에는 세로·가로 모두 내비를 다시 숨긴다.
  useEffect(() => {
    if (!admobReady) return;
    if (Capacitor.getPlatform() !== 'android') return;

    const restoreRideSystemBars = async () => {
      try {
        await SystemBars.hide({ bar: SystemBarType.StatusBar });
        await SystemBars.hide({ bar: SystemBarType.NavigationBar });
      } catch (e) {
        console.warn('[AdMob] interstitial 이후 시스템 바 복원 실패', e);
      }
    };

    let hShow: { remove: () => Promise<void> } | undefined;
    let hDismiss: { remove: () => Promise<void> } | undefined;
    let hFail: { remove: () => Promise<void> } | undefined;

    const attach = async () => {
      hShow = await AdMob.addListener(InterstitialAdPluginEvents.Showed, async () => {
        try {
          await SystemBars.show();
        } catch (e) {
          console.warn('[AdMob] 전면광고용 시스템 바 표시 실패', e);
        }
      });
      hDismiss = await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
        void restoreRideSystemBars();
      });
      hFail = await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => {
        void restoreRideSystemBars();
      });
    };

    void attach();

    return () => {
      void hShow?.remove();
      void hDismiss?.remove();
      void hFail?.remove();
    };
  }, [admobReady]);

  // Rewarded video: 미리 로드(지연 최소화)
  useEffect(() => {
    if (!admobReady) return;
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    const run = async () => {
      try {
        await AdMob.prepareRewardVideoAd({
          adId: ADMOB_REWARD_VIDEO_AD_UNIT_ID,
        } satisfies RewardAdOptions);
        if (cancelled) return;
        rewardPreparedRef.current = true;
      } catch (e) {
        if (cancelled) return;
        rewardPreparedRef.current = false;
        console.warn('[AdMob] rewarded prepare failed', e);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [admobReady]);

  // route 상태 변경 시 routeRef 동기화 (stale closure 방지)
  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  // 주행 시작→미니맵 전환 시 Google Map 크기 갱신
  useEffect(() => {
    const map = googleMapRef.current;
    if (!map || !isSvFullScreen) return;
    const t1 = setTimeout(() => triggerMapResize(map), 100);
    const t2 = setTimeout(() => triggerMapResize(map), 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isSvFullScreen, triggerMapResize]);

  // 도로(Road)는 항상 표시. 켜고 끄는 대상이 아님.
  useEffect(() => {
    const map = googleMapRef.current;
    if (!map) return;
    map.setOptions({ styles: null });
  }, [isMapReady]);

  // Show Streetview Coverage: 거리뷰 가능한 전체 도로 레이어(Google StreetViewCoverageLayer) 표시/숨김.
  useEffect(() => {
    const map = googleMapRef.current;
    if (!map) {
      if (streetViewCoverageLayerRef.current) streetViewCoverageLayerRef.current.setMap(null);
      return;
    }
    if (!streetViewCoverageLayerRef.current) {
      streetViewCoverageLayerRef.current = new google.maps.StreetViewCoverageLayer();
    }
    streetViewCoverageLayerRef.current.setMap(showCoverage ? map : null);
  }, [showCoverage, isMapReady]);

  // 탐색된 경로(폴리라인)는 showCoverage와 무관하게 항상 동일 스타일로 표시.
  useEffect(() => {
    const poly = googlePolylineRef.current;
    if (!poly) return;
    poly.setOptions({
      strokeColor: '#ff3020',
      strokeWeight: 5,
      strokeOpacity: 1,
    });
  }, [route]);

  // 카운트다운 4초 (3 → 2 → 1 → Start! 각 1초) 후 콜백 실행
  useEffect(() => {
    if (countdown === null) return;
    // 카운트다운 진입 순간 TTS 엔진을 한 번 워밍업.
    // Android WebView + Capacitor TTS 는 cold-start 시 첫 발화까지 수십 초가
    // 걸릴 수 있으므로, "Ready" 라는 짧은 음성으로 보이스/엔진을 미리 초기화해
    // 카운트다운 종료 시점의 실제 코칭 발화 지연을 줄인다.
    if (countdown === 3) {
      try {
        speakRef.current?.('Ready');
      } catch {
        // 웜업 실패는 무시 — 실제 코칭 발화 경로의 fallback 이 처리.
      }
    }
    const t = window.setTimeout(() => {
      if (countdown === 3) setCountdown(2);
      else if (countdown === 2) setCountdown(1);
      else if (countdown === 1) setCountdown('start');
      else if (countdown === 'start') {
        setCountdown(null);
        countdownDoneRef.current?.();
        countdownDoneRef.current = null;
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> = 0;
    // 의존성은 route?.path만 사용하고, panoData/cachedCoaching 등은 routeRef로 참조 (stale closure 방지)
    const routeData = routeRef.current;
    if (!route?.path?.length || !routeData) return () => clearTimeout(timer);
    const currentIdx = Math.min(Math.max(0, simulation.currentIndex), route.path.length - 1);
    let currentPos = route.path[currentIdx];
    let adjustedIdx = currentIdx;

    // 방어: path가 sparse이거나 좌표가 없으면 다음 유효한 인덱스로 스킵 (최대 10개까지)
    if (!currentPos) {
      const maxSkip = Math.min(10, route.path.length - currentIdx - 1);
      for (let skip = 1; skip <= maxSkip; skip++) {
        const nextIdx = currentIdx + skip;
        if (route.path[nextIdx]) {
          adjustedIdx = nextIdx;
          currentPos = route.path[nextIdx];
          console.log(`[SIMULATION_SKIP] sparse path at ${currentIdx}, skipping to ${nextIdx}`);
          setSimulation(prev => ({ ...prev, currentIndex: nextIdx }));
          return () => clearTimeout(timer);
        }
      }
      // 유효한 인덱스를 찾지 못하면 경로 끝으로 처리
      console.log('[SIMULATION_STOP] reason=no_valid_position_found');
      setSimulation(prev => ({ ...prev, isActive: false }));
      setAppPhase('IDLE');
      return () => clearTimeout(timer);
    }

    const lookAheadIdx = Math.min(adjustedIdx + 10, route.path.length - 1);
    const targetPosForHeading = route.path[lookAheadIdx];

    // Sync simulation marker to currentIndex (주행 중·일시정지 공통)
    const lat = typeof currentPos.lat === 'function' ? currentPos.lat() : currentPos.lat;
    const lng = typeof currentPos.lng === 'function' ? currentPos.lng() : currentPos.lng;
    const map = googleMapRef.current;
    let flipHorizontal = false;
    if (lookAheadIdx > currentIdx && targetPosForHeading) {
      try {
        const heading = computeHeading(currentPos, targetPosForHeading);
        flipHorizontal = heading > 180;
      } catch {
        // 좌표 형식 오류 시 heading 스킵
      }
    }
    const dataUrl = cyclingMarkerDataUrlRef.current;
    const cyclingIcon = (() => {
      if (dataUrl) {
        const flip = flipHorizontal ? ' translate(20,20) scale(-1,1) translate(-20,-20)' : '';
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><g transform="' + flip + '"><image href="' + dataUrl.replace(/"/g, "'") + '" x="0" y="0" width="40" height="40" preserveAspectRatio="xMidYMid meet"/></g></svg>';
        return { url: 'data:image/svg+xml,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20) };
      }
      return { url: '/cycling_position_marker.png', scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20) };
    })();
    if (!simulationMarker.current && map) {
      simulationMarker.current = new google.maps.Marker({
        position: { lat, lng },
        map,
        icon: cyclingIcon,
      });
    } else if (simulationMarker.current) {
      simulationMarker.current.setPosition({ lat, lng });
      simulationMarker.current.setIcon(cyclingIcon);
    }

    // 일시정지 상태: ref·거리뷰·맵만 동기화 후 종료 (타이머 없음)
    if (!simulation.isActive) {
      svDisplayPathIndexRef.current = currentIdx;
      lastDisplayedPanoPathIndexRef.current = currentIdx - 1;
      lastSvDisplayUpdateRef.current = Date.now();
      if (isSvActive && routeData.panoData?.length) {
        const panoItem = getPanoDataForIndex(routeData.panoData, currentIdx);
        if (panoItem) {
          lastDisplayedPanoPathIndexRef.current = panoItem.pathIndex;
          setPanoramaViewByPanoId(panoItem.panoId, panoItem.heading, panoItem.isUserPhoto);
          setShowSvWarning(false);
        }
      }
      if (isSvFullScreen && googleMapRef.current) {
        const plat = typeof currentPos.lat === 'function' ? currentPos.lat() : currentPos.lat;
        const plng = typeof currentPos.lng === 'function' ? currentPos.lng() : currentPos.lng;
        googleMapRef.current.panTo({ lat: plat, lng: plng });
      }
      return () => clearTimeout(0);
    }

    // 주행 중: 기존 로직 (타이머, 거리뷰 60km/h 상한, 코칭 등)
    setAppPhase('RUNNING');
    if (tempMarker.current) { tempMarker.current.setMap(null); tempMarker.current = null; }
    if (currentIdx >= route.path.length - 1) {
      console.log('[SIMULATION_STOP] reason=end_of_route');
      setSimulation(prev => ({ ...prev, isActive: false }));
      setAppPhase('IDLE');
      lastSpokenValidUntilPathIndex.current = null;
      getRideEncouragement(routeData, { distance: routeData.distance, duration: routeData.duration }).then(speak);
      return () => clearTimeout(0);
    }

    // Street View 표시 인덱스: 진행 속도는 항상 60 km/h 상한 (주행 스피드 10~70과 독립)
      const METERS_PER_PATH_POINT = 2;
      const MAX_SV_SPEED_M_PER_SEC = (60 * 1000) / 3600;
      if (currentIdx === 0) {
        svDisplayPathIndexRef.current = 0;
        lastSvDisplayUpdateRef.current = Date.now();
        lastDisplayedPanoPathIndexRef.current = -1;
      } else if (svDisplayPathIndexRef.current < currentIdx) {
        const elapsed = Date.now() - lastSvDisplayUpdateRef.current;
        const maxPoints = (MAX_SV_SPEED_M_PER_SEC * (elapsed / 1000)) / METERS_PER_PATH_POINT;
        const advance = Math.min(Math.max(1, Math.floor(maxPoints)), currentIdx - svDisplayPathIndexRef.current);
        if (advance >= 1) {
          svDisplayPathIndexRef.current += advance;
          lastSvDisplayUpdateRef.current = Date.now();
        }
      }
      const svDisplayIdx = svDisplayPathIndexRef.current;
      const svDisplayIdxForPano = svDisplayIdx;

      // ---- STREET VIEW: 캐시만 사용 (주행 중 API 0). 없으면 끄기/안내. [Phase 1] ----
      if (isSvActive) {
        if (routeData.panoData?.length) {
          const panoItem = getPanoDataForIndex(routeData.panoData, svDisplayIdxForPano);
          const lastPano = routeData.panoData[routeData.panoData.length - 1];
          const inGap = lastPano && svDisplayIdxForPano > lastPano.pathIndex + 30;
          if (inGap) {
            setShowSvWarning(true);
          } else if (panoItem && panoItem.pathIndex > lastDisplayedPanoPathIndexRef.current) {
            lastDisplayedPanoPathIndexRef.current = panoItem.pathIndex;
            setPanoramaViewByPanoId(panoItem.panoId, panoItem.heading, panoItem.isUserPhoto);
            setShowSvWarning(false);
          }
          // 슬라이딩 prefetch: 캐시 끝 근처 또는 현재 위치 기준으로 다음 구간 prefetch (갭 구간 지난 뒤에도 재개되도록)
          if (
            lastPano &&
            currentIdx >= lastPano.pathIndex - 150 &&
            !isSegmentFetchingRef.current &&
            svServiceRef.current
          ) {
            isSegmentFetchingRef.current = true;
            const path = route.path;
            const cumDist: number[] = [0];
            for (let i = 1; i < path.length; i++) {
              cumDist[i] = cumDist[i - 1] + computeDistanceBetween(path[i - 1], path[i]);
            }
            const totalM = cumDist[path.length - 1];
            const distAtLast = cumDist[Math.min(lastPano.pathIndex, path.length - 1)];
            const distAtCurrent = cumDist[Math.min(currentIdx, path.length - 1)];
            // 마지막 pano 기준과 현재 주행 위치 중 더 앞선 쪽부터 prefetch → 갭 이후 구간도 수집
            const fromM = Math.max(distAtLast + 10, distAtCurrent);
            const toM = Math.min(fromM + 400, totalM);
            if (fromM < toM) {
              preFetchStreetViewData(path, () => { }, { fromDistanceM: fromM, maxDistanceM: toM, intervalM: 10 })
                .then(({ panoData: nextPanos }) => {
                  if (nextPanos.length) {
                    setRoute((prev) => prev ? { ...prev, panoData: [...(prev.panoData || []), ...nextPanos] } : null);
                  }
                })
                .finally(() => { isSegmentFetchingRef.current = false; });
            } else {
              isSegmentFetchingRef.current = false;
            }
          }
        } else {
          setShowSvWarning(true);
        }
        if (isSvFullScreen && googleMapRef.current) {
          const now = Date.now();
          if (now - lastPanToTime.current > 1000) {
            lastPanToTime.current = now;
            const plat = typeof currentPos.lat === 'function' ? currentPos.lat() : currentPos.lat;
            const plng = typeof currentPos.lng === 'function' ? currentPos.lng() : currentPos.lng;
            googleMapRef.current.panTo({ lat: plat, lng: plng });
          }
        }
      }
      // -----------------------------------------------------------

      // ---- AI COACHING: Predictive (cachedCoaching) + legacy safety net. 모든 멘트는 브라우저 TTS(speak). ----
      const elevation = routeData.elevation ?? [];
      const elevationReadyForCoach = elevation.length > 0 && elevation.some(p => p.elevation !== 0);
      const cached = routeData.cachedCoaching;
      const currentCached = cached?.find(c => c.validUntilPathIndex >= currentIdx);
      if (currentCached) {
        const nowMs = Date.now();
        const currentRes = currentCached.coaching.resistance;
        const resChanged = lastSpokenResistanceRef.current !== currentRes;
        // 같은 R 이 길게 이어져 지루해지지 않도록 일정 주기마다 tip 재추첨 발화(R 변화 없어도 멘트 갱신)
        const timeElapsed = nowMs - lastCoachSpeakAtMsRef.current >= COACH_PERIODIC_SPEAK_MS;
        if (resChanged) {
          setCoachData(currentCached.coaching);
          speak(currentCached.coaching.tip);
          lastCoachSpeakAtMsRef.current = nowMs;
          lastSpokenResistanceRef.current = currentRes;
          lastSpokenValidUntilPathIndex.current = currentCached.validUntilPathIndex;
          lastSpokenTipIndexRef.current = null;
        } else if (timeElapsed) {
          // R 밴드는 그대로 두고 tip 만 재추첨. 직전 tip 과는 다른 것을 고른다.
          // Steady 라벨은 폐기됐으므로 isSteady=false 고정. (혹시 이전 빌드 캐시에 남아 있는
          // "Steady" 문자열이 들어와도 parseResistanceBand 가 R3 로 매핑하여 안전.)
          const band = parseResistanceBand(currentRes);
          const fresh = pickFreshTipForResistance(band, false, lastSpokenTipIndexRef.current);
          setCoachData({ ...currentCached.coaching, tip: fresh.displayText });
          speak(fresh.displayText);
          lastCoachSpeakAtMsRef.current = nowMs;
          lastSpokenTipIndexRef.current = fresh.tipIndex;
        } else {
          // 변화 없음 + 주기 미도달: 텍스트만 싱크(이미 세팅돼 있으면 no-op). speak 생략.
          setCoachData(currentCached.coaching);
        }
        // ---- Prefetch: 캐시 끝(lastValid)이 다가오면 그 "뒤" 구간을 기준으로 새 세그먼트를 생성해 cache 를 실제로 확장 ----
        const pathLen = route.path.length;
        const lastValid = cached?.length ? cached[cached.length - 1]?.validUntilPathIndex ?? 0 : 0;
        const canExtend = lastValid < pathLen - 1;
        if (
          canExtend &&
          currentIdx >= lastValid - 100 &&
          !isPrefetchingCoachRef.current &&
          elevationReadyForCoach
        ) {
          isPrefetchingCoachRef.current = true;
          const elevLen = elevation.length;
          // 기준 인덱스는 "미래" 로 밀어 주어야 새 항목의 validUntil 이 반드시 lastValid 보다 커진다
          const startPathIdx = Math.min(pathLen - 1, Math.max(currentIdx, lastValid));
          const rawStartElevIdx = Math.min(elevLen - 1, Math.floor((startPathIdx / pathLen) * elevLen));
          // elevLen 대비 경로 길이가 촘촘해 edge 에서 1-점 슬라이스가 나오면
          // getAdvancedCoaching 이 slope 계산 불가로 (Steady) 로 빠지는 문제가 있어,
          // 슬라이스가 최소 2 샘플이 되도록 startElevIdx 를 과거 방향으로 한 번 백오프한다.
          const MIN_SLICE_POINTS = 2;
          const rawSegmentSize = Math.min(20, elevLen - rawStartElevIdx);
          let sliceStartIdx = rawStartElevIdx;
          let segmentSize = rawSegmentSize;
          if (segmentSize < MIN_SLICE_POINTS && elevLen >= MIN_SLICE_POINTS) {
            sliceStartIdx = Math.max(0, elevLen - MIN_SLICE_POINTS);
            segmentSize = elevLen - sliceStartIdx;
          }
          if (segmentSize >= MIN_SLICE_POINTS) {
            const upcomingSlice = elevation.slice(sliceStartIdx, sliceStartIdx + segmentSize);
            setIsCoachThinking(true);
            getPredictiveCoaching(upcomingSlice, pathLen, elevLen, startPathIdx, effectiveSpeedKmHRef.current, coachData?.resistance)
              .then(({ coaching, validUntilPathIndex }) => {
                // 방어: 새 validUntil 이 lastValid 보다 크지 않으면 무한 루프 방지를 위해 append 생략
                if (validUntilPathIndex > lastValid) {
                  setRoute(prev => prev ? { ...prev, cachedCoaching: [...(prev.cachedCoaching || []), { coaching, validUntilPathIndex }] } : null);
                }
              })
              .finally(() => {
                setIsCoachThinking(false);
                isPrefetchingCoachRef.current = false;
              });
          } else {
            isPrefetchingCoachRef.current = false;
          }
        }
      } else if (
        currentIdx > 0 &&
        currentIdx - lastCoachedIndex.current >= 21 &&
        elevationReadyForCoach
      ) {
        // Safety net: 캐시가 비어 있는(=prefetch 실패/대기) 상황에서, 누적 거리 기반으로 한 번씩 멘트를 생성
        (async () => {
          const pathLen = route.path.length;
          const elevLen = elevation.length;
          const currentElev = elevation[Math.floor((currentIdx / pathLen) * elevLen)]?.elevation ?? 0;
          const rawStart = Math.floor((currentIdx / pathLen) * elevLen);
          const rawEnd = Math.floor(((currentIdx + 20) / pathLen) * elevLen);
          // 최소 2 샘플 보장 — 경로 끝 근처에서 1-점 슬라이스가 생겨 Steady 로 빠지는 것 방지
          let sliceStart = rawStart;
          let sliceEnd = rawEnd;
          if (sliceEnd - sliceStart < 2 && elevLen >= 2) {
            sliceStart = Math.max(0, elevLen - 2);
            sliceEnd = elevLen;
          }
          const upcoming = elevation.slice(sliceStart, sliceEnd);
          setIsCoachThinking(true);
          try {
            const newCoaching = await getAdvancedCoaching(currentElev, upcoming, effectiveSpeedKmHRef.current, coachData?.resistance);
            setCoachData(newCoaching);
            speak(newCoaching.tip);
          } finally {
            setIsCoachThinking(false);
            lastCoachedIndex.current = currentIdx;
          }
        })();
      }
      // 이 effect는 currentIndex 변화 시 뷰 동기화만 담당. 진행(index 증가)은 아래 별도 interval effect가 수행.
    return () => clearTimeout(timer);
  }, [simulation.isActive, simulation.currentIndex, route?.path, isSvFullScreen, isSvActive]);

  // Simulation progression driver: runs continuously while simulation is active,
  // accumulates distance from live speed, and advances currentIndex by path segments.
  // Decoupled from currentIndex/speed state so speed fluctuations cannot tear down the timer.
  useEffect(() => {
    if (!simulation.isActive) return;
    if (!route?.path?.length) return;
    const path = route.path;
    let lastTickMs = Date.now();
    let pendingMeters = 0;
    const interval = window.setInterval(() => {
      const now = Date.now();
      const dtSec = Math.max(0, (now - lastTickMs) / 1000);
      lastTickMs = now;

      const sensorDriveOn = sensorPrefsRef.current.sensorDriveEnabled;
      const emaRpm = sensorRpmEmaRef.current ?? 0;
      const hub = getIndoorBleHub();
      const lastPacketAt = hub.getLastSensorPacketAtMs();
      const lastValidRpmAt = sensorLastValidRpmAtRef.current;
      const freshSensorSignal =
        lastPacketAt > 0 &&
        now - lastPacketAt < SENSOR_NO_PACKET_FORCE_ZERO_MS &&
        lastValidRpmAt > 0 &&
        now - lastValidRpmAt < SENSOR_HARD_ZERO_MS;
      const pedalingActive = sensorDriveOn && freshSensorSignal && emaRpm >= SENSOR_PEDALING_RPM_THRESHOLD;
      const effSpeed = effectiveSpeedKmHRef.current;
      const keepMoving = effSpeed > SENSOR_MOVE_STOP_KMH || pedalingActive;
      if (!keepMoving) return;

      pendingMeters += (effSpeed * 1000 / 3600) * dtSec;

      setSimulation(prev => {
        let idx = prev.currentIndex;
        const maxIdx = path.length - 1;
        let safety = 2000;
        while (pendingMeters > 0 && idx < maxIdx && safety-- > 0) {
          const p1 = path[idx];
          const p2 = path[idx + 1];
          if (!p1 || !p2) {
            idx += 1;
            continue;
          }
          let segDist = 2;
          try { segDist = computeDistanceBetween(p1, p2); } catch { /* keep fallback */ }
          if (!Number.isFinite(segDist) || segDist <= 0) segDist = 2;
          if (pendingMeters >= segDist) {
            pendingMeters -= segDist;
            idx += 1;
          } else {
            break;
          }
        }
        if (idx === prev.currentIndex) return prev;
        return { ...prev, currentIndex: idx };
      });
    }, 100);
    return () => clearInterval(interval);
  }, [simulation.isActive, route?.path]);

  // Secondary Effect for Timer (same as before)
  useEffect(() => {
    let timer: number | null = null;
    if (simulation.isActive && route) {
      timer = window.setInterval(() => {
        setElapsedTime(prev => prev + 1);
        const metersPerSecond = (effectiveSpeedKmHRef.current * 1000) / 3600;
        setCoveredDistance(prev => prev + metersPerSecond);
      }, 1000);
    }
    return () => {
      if (timer != null) clearInterval(timer);
    };
  }, [simulation.isActive, route]);

  // Rewarded ad policy: 5km default limit + second offer before the limit.
  useEffect(() => {
    if (!simulation.isActive) return;
    if (!route) return;
    if (!admobReady) return;
    if (!Capacitor.isNativePlatform()) return;
    if (rewardAdInFlightRef.current) return;
    if (rewardOfferModalStage) return; // don't auto-stop / prompt while modal is open

    const allowedLimit = rideAllowedLimitMetersRef.current;
    if (!allowedLimit || allowedLimit <= 0) return;

    // Second offer right before reaching the default 5km cap.
    const isStillDefaultCap = allowedLimit <= DEFAULT_RIDE_LIMIT_M + 1;
    const secondOfferThreshold = DEFAULT_RIDE_LIMIT_M - SECOND_REWARD_OFFER_BEFORE_M;
    if (
      isStillDefaultCap &&
      rewardFirstDeclinedRef.current &&
      !rewardGrantedForRideRef.current &&
      !rewardSecondOfferShownRef.current &&
      coveredDistance >= secondOfferThreshold
    ) {
      rewardSecondOfferShownRef.current = true;
      // Pause ride while user chooses (avoid reaching the limit while modal is open).
      setSimulation(prev => ({ ...prev, isActive: false }));
      setRewardOfferModalStage('SECOND');
      setRewardOfferTargetKm(rideTargetMetersRef.current / 1000);
      return;
    }

    // Stop ride only for the default 5km cap (routes <= 5km should not be interrupted).
    const hitDefaultCap = isStillDefaultCap && rewardFirstDeclinedRef.current && !rewardGrantedForRideRef.current;
    if (!rideStoppedByLimitRef.current && hitDefaultCap && coveredDistance >= allowedLimit) {
      rideStoppedByLimitRef.current = true;
      setSimulation(prev => ({ ...prev, isActive: false }));
      setAppPhase('IDLE');

      setRideLimitMessage('You have reached the 5 km limit.');
    }
  }, [coveredDistance, simulation.isActive, route, rewardOfferModalStage, admobReady]);

  const fadeAudio = (targetVolume: number, duration: number = 2000, onComplete?: () => void) => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    const stepTime = 50;
    const steps = duration / stepTime;
    const volumeStep = (targetVolume - audio.volume) / steps;
    fadeIntervalRef.current = window.setInterval(() => {
      let newVolume = audio.volume + volumeStep;
      if (volumeStep > 0 && newVolume >= targetVolume) newVolume = targetVolume;
      if (volumeStep < 0 && newVolume <= targetVolume) newVolume = targetVolume;
      newVolume = Math.max(0, Math.min(1, newVolume));
      audio.volume = newVolume;
      if (newVolume === targetVolume) {
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
        if (onComplete) onComplete();
      }
    }, stepTime);
  };

  const pickRandomTrack = (exclude?: string | null) => {
    if (!PLAYLIST.length) return null;
    if (PLAYLIST.length === 1) return PLAYLIST[0];
    // Avoid immediate repeats which can be fragile on some WebViews.
    for (let i = 0; i < 6; i++) {
      const candidate = PLAYLIST[Math.floor(Math.random() * PLAYLIST.length)];
      if (!exclude || candidate !== exclude) return candidate;
    }
    // Fallback if randomness keeps picking the same track.
    const idx = PLAYLIST.indexOf(exclude ?? '');
    const nextIdx = idx >= 0 ? (idx + 1) % PLAYLIST.length : 0;
    return PLAYLIST[nextIdx];
  };

  const startMusicTrack = (track: string, token: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (bgMusicWatchdogTimerRef.current) {
      clearTimeout(bgMusicWatchdogTimerRef.current);
      bgMusicWatchdogTimerRef.current = null;
    }
    bgMusicSuppressErrorAdvanceUntilRef.current = Date.now() + BG_MUSIC_ERROR_SUPPRESS_MS;

    // Stop any in-flight fade and ensure a clean start.
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    pendingAudioPauseRef.current = false;

    // Force a deterministic restart position even if the same src is selected.
    // Some WebViews can stay "ended" unless currentTime is reset.
    try {
      audio.pause();
    } catch {
      // no-op
    }

    audio.src = track;
    try {
      audio.load();
    } catch {
      // no-op (some browsers auto-load on src)
    }
    try {
      audio.currentTime = 0;
    } catch {
      // no-op (can throw if metadata not ready)
    }

    audio.volume = 0;
    const playPromise = audio.play();
    if (playPromise && typeof (playPromise as any).catch === 'function') {
      playPromise.catch((e: any) => {
        console.log("Audio autoplay blocked or failed", e);
        // If another newer play request started, don't fight it.
        if (musicRetryTokenRef.current !== token) return;
        // If ride/music toggled off, don't retry.
        if (!simulationActiveRef.current || !musicOnRef.current) return;
        const next = pickRandomTrack(track);
        if (!next || next === track) return;
        // Small delay to avoid tight loop on transient failures.
        window.setTimeout(() => {
          if (musicRetryTokenRef.current !== token) return;
          startMusicTrack(next, token);
        }, 250);
      });
    }
    fadeAudio(0.3);
  };

  const playRandomMusic = () => {
    if (!audioRef.current) return;
    const track = pickRandomTrack(lastMusicTrackRef.current);
    if (!track) return;
    lastMusicTrackRef.current = track;
    const token = ++musicRetryTokenRef.current;
    startMusicTrack(track, token);
  };

  const maybeAdvanceBackgroundMusic = (reason: 'ended' | 'error' | 'watchdog' | 'visibility') => {
    if (!simulationActiveRef.current || !musicOnRef.current) return;
    if (pendingAudioPauseRef.current) return;
    const now = Date.now();
    if (now - bgMusicLastAdvanceMsRef.current < BG_MUSIC_ADVANCE_DEBOUNCE_MS) return;
    bgMusicLastAdvanceMsRef.current = now;
    if (reason === 'error') {
      console.warn('[BgMusic] advance after error');
    }
    playRandomMusic();
  };

  maybeAdvanceBackgroundMusicRef.current = maybeAdvanceBackgroundMusic;

  onVisibilityForBgMusicRef.current = () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    const a = audioRef.current;
    if (!a) return;
    if (!simulationActiveRef.current || !musicOnRef.current || pendingAudioPauseRef.current) return;
    if (a.ended) {
      maybeAdvanceBackgroundMusicRef.current('visibility');
      return;
    }
    const d = a.duration;
    if (Number.isFinite(d) && d > 0 && a.currentTime >= d - BG_MUSIC_NEAR_END_SEC) {
      maybeAdvanceBackgroundMusicRef.current('visibility');
      return;
    }
    if (a.paused) {
      void a.play().catch(() => {
        if (!simulationActiveRef.current || !musicOnRef.current || pendingAudioPauseRef.current) return;
        const d2 = a.duration;
        if (
          Number.isFinite(d2) &&
          d2 > 0 &&
          (a.ended || a.currentTime >= d2 - BG_MUSIC_NEAR_END_SEC)
        ) {
          maybeAdvanceBackgroundMusicRef.current('visibility');
        }
      });
    }
  };

  useEffect(() => {
    const clearBgMusicWatchdog = () => {
      if (bgMusicWatchdogTimerRef.current) {
        clearTimeout(bgMusicWatchdogTimerRef.current);
        bgMusicWatchdogTimerRef.current = null;
      }
    };

    const onEnded = () => {
      clearBgMusicWatchdog();
      maybeAdvanceBackgroundMusicRef.current('ended');
    };

    const onError = () => {
      if (Date.now() < bgMusicSuppressErrorAdvanceUntilRef.current) return;
      clearBgMusicWatchdog();
      maybeAdvanceBackgroundMusicRef.current('error');
    };

    const onTimeUpdate = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (!simulationActiveRef.current || !musicOnRef.current || pendingAudioPauseRef.current) {
        clearBgMusicWatchdog();
        return;
      }
      if (audio.ended) return;
      const d = audio.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      if (audio.currentTime < d - BG_MUSIC_NEAR_END_SEC) {
        clearBgMusicWatchdog();
        return;
      }
      if (bgMusicWatchdogTimerRef.current) return;
      const srcAtSchedule = audio.src;
      bgMusicWatchdogTimerRef.current = window.setTimeout(() => {
        bgMusicWatchdogTimerRef.current = null;
        const a = audioRef.current;
        if (!a || a.src !== srcAtSchedule) return;
        if (!simulationActiveRef.current || !musicOnRef.current || pendingAudioPauseRef.current) return;
        const d2 = a.duration;
        if (!Number.isFinite(d2) || d2 <= 0) return;
        if (a.ended || a.currentTime >= d2 - BG_MUSIC_NEAR_END_SEC * 0.85) {
          maybeAdvanceBackgroundMusicRef.current('watchdog');
        }
      }, BG_MUSIC_WATCHDOG_MS);
    };

    if (!audioRef.current) {
      audioRef.current = new Audio();
      const el = audioRef.current;
      el.addEventListener('ended', onEnded);
      el.addEventListener('error', onError);
      el.addEventListener('timeupdate', onTimeUpdate);
    }
    return () => {
      clearBgMusicWatchdog();
      if (audioRef.current) {
        const el = audioRef.current;
        el.removeEventListener('ended', onEnded);
        el.removeEventListener('error', onError);
        el.removeEventListener('timeupdate', onTimeUpdate);
        el.pause();
        audioRef.current = null;
      }
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const handler = () => onVisibilityForBgMusicRef.current();
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  useEffect(() => {
    if (simulation.isActive && musicOn) {
      if (audioRef.current && (audioRef.current.paused || pendingAudioPauseRef.current)) {
        playRandomMusic();
      }
    } else {
      if (audioRef.current && !audioRef.current.paused) {
        pendingAudioPauseRef.current = true;
        fadeAudio(0, 2000, () => {
          const shouldKeepPlaying = simulationActiveRef.current && musicOnRef.current;
          if (shouldKeepPlaying) {
            playRandomMusic();
            return;
          }
          audioRef.current?.pause();
          pendingAudioPauseRef.current = false;
        });
      }
    }
  }, [simulation.isActive, musicOn]);

  const getSpeechSynthesisSafe = () => {
    if (typeof window === 'undefined') return null;
    const synth = window.speechSynthesis;
    if (!synth || typeof synth.cancel !== 'function' || typeof synth.speak !== 'function') return null;
    return synth;
  };

  const stopNativeSpeech = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await TextToSpeech.stop();
    } catch (e) {
      console.warn('[SpeechGuard] native stop failed', e);
    }
  }, []);

  const safeSpeechCancel = useCallback(() => {
    if (speechStartTimeoutRef.current) {
      clearTimeout(speechStartTimeoutRef.current);
      speechStartTimeoutRef.current = null;
    }
    const synth = getSpeechSynthesisSafe();
    if (synth) {
      try {
        synth.cancel();
      } catch (e) {
        console.warn('[SpeechGuard] cancel failed', e);
      }
    }
    void stopNativeSpeech();
  }, [stopNativeSpeech]);

  const speak = useCallback((text: string) => {
    if (!coachingOn) return;
    const normalizedText = (text || '').trim();
    if (!normalizedText) return;
    const requestId = ++speechRequestIdRef.current;
    const isNativePlatform = Capacitor.isNativePlatform();

    const synth = getSpeechSynthesisSafe();
    safeSpeechCancel();

    const speakNative = async (reason: string) => {
      if (!isNativePlatform) return;
      const run = async (lang: string) => {
        await TextToSpeech.speak({
          text: normalizedText,
          lang,
          rate: 1.0,
          pitch: 1.0,
          volume: 1.0,
        });
      };
      try {
        if (speechRequestIdRef.current !== requestId) return;
        setIsSpeaking(true);
        await run('en-US');
      } catch (e) {
        console.warn(`[SpeechGuard] native fallback failed (${reason}, en-US)`, e);
        try {
          if (speechRequestIdRef.current !== requestId) return;
          await run('ko-KR');
        } catch (e2) {
          console.warn(`[SpeechGuard] native fallback failed (${reason}, ko-KR)`, e2);
        }
      } finally {
        if (speechRequestIdRef.current === requestId) {
          setIsSpeaking(false);
        }
      }
    };

    if (!synth) {
      void speakNative('web_unavailable');
      return;
    }

    // cancel 직후 즉시 speak 시 일부 브라우저에서 재생이 누락되는 문제 방지
    const scheduleSpeak = () => {
      let webStarted = false;
      let fallbackTriggered = false;

      const fallbackToNative = (reason: string) => {
        if (!isNativePlatform || fallbackTriggered) return;
        fallbackTriggered = true;
        if (speechStartTimeoutRef.current) {
          clearTimeout(speechStartTimeoutRef.current);
          speechStartTimeoutRef.current = null;
        }
        try {
          synth.cancel();
        } catch {
          // no-op
        }
        void speakNative(reason);
    };
      const utterance = new SpeechSynthesisUtterance(normalizedText);
      utterance.lang = 'en-US';
      const voices = synth.getVoices();
      const preferredVoice = voices.find(voice =>
        voice.lang.startsWith('en') &&
        (voice.name.includes('Female') || voice.name.includes('Google US English') || voice.name.includes('Samantha'))
      );
      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.rate = 1.0;
      utterance.onstart = () => {
        if (speechRequestIdRef.current !== requestId) return;
        webStarted = true;
        if (speechStartTimeoutRef.current) {
          clearTimeout(speechStartTimeoutRef.current);
          speechStartTimeoutRef.current = null;
        }
        setIsSpeaking(true);
      };
      utterance.onend = () => {
        if (speechRequestIdRef.current !== requestId) return;
        setIsSpeaking(false);
      };
      utterance.onerror = (e) => {
        if (speechRequestIdRef.current !== requestId) return;
        console.warn('[SpeechGuard] web speech error', e);
        setIsSpeaking(false);
        fallbackToNative('web_error');
      };
      try {
        synth.speak(utterance);
        if (isNativePlatform) {
          speechStartTimeoutRef.current = window.setTimeout(() => {
            if (speechRequestIdRef.current !== requestId) return;
            if (!webStarted) {
              console.warn('[SpeechGuard] web speech start timeout; fallback to native');
              fallbackToNative('web_start_timeout');
            }
          }, 1200);
        }
      } catch (e) {
        console.warn('[SpeechGuard] web speak failed', e);
        fallbackToNative('web_speak_exception');
      }
    };
    window.setTimeout(scheduleSpeak, 50);
  }, [coachingOn, safeSpeechCancel]);

  // 카운트다운 진입 시점 등 speak 정의 이전의 effect 에서 참조할 수 있도록 최신 speak 를 ref 에 보관.
  useEffect(() => {
    speakRef.current = speak;
  }, [speak]);

  useEffect(() => {
    if (!coachingOn) {
      safeSpeechCancel();
      setIsSpeaking(false);
    }
  }, [coachingOn]);

  // Speech Synthesis voices 로드 촉진 (Chrome 등에서 getVoices()가 초기에 빈 배열인 문제 완화)
  useEffect(() => {
    const synth = getSpeechSynthesisSafe();
    if (!synth || typeof synth.addEventListener !== 'function' || typeof synth.removeEventListener !== 'function') return;
    const onVoicesChanged = () => { synth.getVoices(); };
    synth.addEventListener('voiceschanged', onVoicesChanged);
    onVoicesChanged();
    return () => synth.removeEventListener('voiceschanged', onVoicesChanged);
  }, []);

  const createCustomMarker = (latLng: any, label: string, color: string): google.maps.Marker => {
    const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
    const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
    const map = googleMapRef.current;
    if (!map) throw new Error('Map not ready');
    const marker = new google.maps.Marker({
      position: { lat, lng },
      map,
      label: { text: label, color: 'white', fontWeight: 'bold', fontSize: '14px' },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
    });
    googleMarkersRef.current.push(marker);
    return marker;
  };

  /** 저장된 payload 로 경로 복원.
   *  v2 (USE_OFFLINE_ROUTE_RESTORE=true): OSRM/Elevation 재호출 없이 densifiedGeometry + elevationSamples 사용 → 네트워크 없어도 주행 가능.
   *  v1 또는 오프라인 복원 실패: Open-Elevation 재요청 후 self-heal (payload v2 로 승격).
   *  Street View prefetch 는 별도 백그라운드 단계로, 경로 복원 자체를 블로킹하지 않는다.
   */
  const restoreRouteFromSavedGeometry = useCallback(async (saved: SavedRoute) => {
    const payload = saved.routePayload;
    if (!payload?.fullGeometry?.length) return;
    if (typeof google === 'undefined' || !google.maps?.LatLng) {
      console.warn('[RESTORE] google.maps not ready; aborting restore for', saved.id);
      return;
    }
    setLoading(true);
    try {
      const canOffline = USE_OFFLINE_ROUTE_RESTORE && isOfflineRestorablePayload(payload);

      // 1) densifiedGeometry 결정 — v2 이면 저장된 것, 아니면 fullGeometry 를 즉석 densify
      const densifiedLatLng: [number, number][] = canOffline && payload.densifiedGeometry?.length
        ? payload.densifiedGeometry
        : densifyLatLngPath(payload.fullGeometry, ROUTE_DENSIFY_INTERVAL_M);
      const path = densifiedLatLng.map(([lat, lng]) => new google.maps.LatLng(lat, lng));
      if (path.length < 2) throw new Error('Restored path too short');

      // 2) elevation 준비 — 저장된 elevationSamples 가 있으면 재구성, 없으면 평지로 초기화 후 백그라운드 재요청
      let elevationResults: Array<{ elevation: number; location: any; resolution: number }> = [];
      let elevationHydratedFromPayload = false;
      if (canOffline && payload.elevationSamples && payload.elevationSamples.length > 0) {
        const rawElevs = payload.elevationSamples.map(([, , elev]) => elev);
        const smoothedElevs = openElevation.smoothElevations(rawElevs);
        elevationResults = applyRoadElevationModel(
          payload.elevationSamples.map(([lat, lng, elev], i) => ({
            elevation: smoothedElevs[i] ?? elev,
            location: new google.maps.LatLng(lat, lng),
            resolution: 0
          }))
        );
        elevationHydratedFromPayload = true;
      } else {
        const sampleStep = Math.max(1, Math.floor(path.length / 100));
        for (let i = 0; i < path.length; i += sampleStep) {
          elevationResults.push({ elevation: 0, location: path[i], resolution: 0 });
        }
        if (elevationResults[elevationResults.length - 1]?.location !== path[path.length - 1]) {
          elevationResults.push({ elevation: 0, location: path[path.length - 1], resolution: 0 });
        }
      }

      // 3) 마커·폴리라인 동기 재구성
      const oldMarkers = [startMarker.current, endMarker.current, ...waypointMarkers.current].filter(Boolean);
      oldMarkers.forEach(m => m?.setMap(null));
      googleMarkersRef.current = googleMarkersRef.current.filter(m => !oldMarkers.includes(m));
      startMarker.current = null;
      endMarker.current = null;
      waypointMarkers.current = [];
      if (googlePolylineRef.current) {
        googlePolylineRef.current.setMap(null);
        googlePolylineRef.current = null;
      }
      const originSeed = payload.originLatLng ? new google.maps.LatLng(payload.originLatLng[0], payload.originLatLng[1]) : path[0];
      const destSeed = payload.destLatLng ? new google.maps.LatLng(payload.destLatLng[0], payload.destLatLng[1]) : path[path.length - 1];
      startMarker.current = createCustomMarker(path[0], 'A', '#3b82f6');
      endMarker.current = createCustomMarker(path[path.length - 1], 'B', '#ef4444');
      saved.waypoints.forEach((wp, idx) => {
        waypointMarkers.current.push(createCustomMarker({ lat: wp.lat, lng: wp.lng }, (idx + 1).toString(), '#f59e0b'));
      });
      const gmap = googleMapRef.current;
      if (gmap) {
        const pathForPoly = path.map((p: any) => ({ lat: p.lat(), lng: p.lng() }));
        googlePolylineRef.current = new google.maps.Polyline({ path: pathForPoly, strokeColor: '#ff3020', strokeWeight: 5, clickable: true });
        googlePolylineRef.current.setMap(gmap);
        googlePolylineRef.current.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) handleLocationClickRef.current(e.latLng.lat(), e.latLng.lng());
        });
      }

      // 4) 상태 동기 세팅 — 여기까지가 네트워크 없이 주행 가능한 상태
      const modeBySavedProfile = modeFromProfile(payload.profile);
      setMode(modeBySavedProfile);
      setLockedRouteProfile(payload.profile);
      setRoute({
        origin: saved.origin,
        destination: saved.destination,
        distance: payload.distance,
        duration: payload.duration,
        path,
        elevation: elevationResults,
        ...(payload.totalDistanceMeters != null ? { totalDistanceMeters: payload.totalDistanceMeters } : {}),
        ...(payload.cumulativeDistances ? { cumulativeDistances: payload.cumulativeDistances } : {})
      });
      lastRouteRequestRef.current = {
        origin: saved.origin.trim(),
        destination: saved.destination.trim(),
        waypointNames: saved.waypoints.map(w => (w.name || '').trim()),
        mode: modeBySavedProfile
      };
      lastOsrmDecodedPathRef.current = payload.fullGeometry.slice();
      setRouteSource('OSRM');
      console.log('[SIMULATION_STOP] reason=restore_saved_route');
      setSimulation({ isActive: false, currentIndex: 0, speed: 100 });
      setAppPhase('IDLE');
      svDisplayPathIndexRef.current = 0;
      lastDisplayedPanoPathIndexRef.current = -1;
      // 이전 ride 잔존 상태 전면 리셋 — coach text·elapsed·covered·코칭 refs 가
      // 새 경로 주행 시작 전까지 이전 값을 보여 주는 문제 방지
      setCoachData(null);
      setElapsedTime(0);
      setCoveredDistance(0);
      setAverageRpm(0);
      rpmSampleSumRef.current = 0;
      rpmSampleCountRef.current = 0;
      lastCoachedIndex.current = -1;
      lastValidUntilFetched.current = -1;
      lastSpokenValidUntilPathIndex.current = null;
      isPrefetchingCoachRef.current = false;
      lastCoachSpeakAtMsRef.current = 0;
      lastSpokenResistanceRef.current = null;
      lastSpokenTipIndexRef.current = null;
      originLocationRef.current = originSeed;
      destLocationRef.current = destSeed;
      if (path.length > 0) {
        const startPos = path[0];
        const heading = path.length > 1 ? computeHeading(startPos, path[1]) : 0;
        setPanoramaView(startPos, heading);
      }
      if (googleMapRef.current && path.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        path.forEach((p: any) => bounds.extend(p));
        googleMapRef.current.fitBounds(bounds);
      }

      // 5) Elevation self-heal — payload 에 elevation 없을 때만 백그라운드로 한 번 보강 + v2 승격
      if (!elevationHydratedFromPayload) {
        (async () => {
          try {
            const samples = openElevation.elevationSamplesForPath(path.length);
            const openRes = await fetchElevationAlongOsrmPath(path, samples, modeBySavedProfile);
            const smoothed = openElevation.smoothElevations(openRes.results.map((r) => r.elevation));
            const hydrated = applyRoadElevationModel(
              openRes.results.map((r, i) => ({
                elevation: smoothed[i] ?? r.elevation,
                location: new google.maps.LatLng(r.latitude, r.longitude),
                resolution: 0
              }))
            );
            setRoute((prev) => prev ? { ...prev, elevation: hydrated } : prev);
            const usedProvider = (openRes as { usedProvider?: 'open-elevation' | 'opentopodata' }).usedProvider;
            setElevationStatus({ kind: 'ok', provider: usedProvider });
            // payload v2 로 승격(다음 로드부터는 네트워크 불필요)
            const elevationSamples: [number, number, number][] = hydrated.map((r) => {
              const lat = typeof r.location.lat === 'function' ? r.location.lat() : r.location.lat;
              const lng = typeof r.location.lng === 'function' ? r.location.lng() : r.location.lng;
              return [fix8(lat), fix8(lng), Number((Number(r.elevation) || 0).toFixed(3))] as [number, number, number];
            });
            const cumulative = payload.cumulativeDistances?.length === densifiedLatLng.length
              ? payload.cumulativeDistances
              : computeCumulativeDistances(densifiedLatLng);
            const totalM = cumulative[cumulative.length - 1] ?? 0;
            const upgraded: SavedRoutePayload = {
              schemaVersion: SAVED_ROUTE_PAYLOAD_VERSION,
              provider: 'osrm',
              profile: payload.profile,
              distance: payload.distance,
              duration: payload.duration,
              fullGeometry: payload.fullGeometry,
              densifiedGeometry: densifiedLatLng,
              cumulativeDistances: cumulative.map(d => Number(d.toFixed(2))),
              elevationSamples,
              totalDistanceMeters: Number(totalM.toFixed(2)),
              originLatLng: payload.originLatLng ?? toLatLngPair(originSeed),
              destLatLng: payload.destLatLng ?? toLatLngPair(destSeed),
              waypointLatLngs: payload.waypointLatLngs ?? saved.waypoints.map(wp => [fix8(wp.lat), fix8(wp.lng)] as [number, number]),
              createdAt: payload.createdAt ?? Date.now()
            };
            updateFavoriteRoutePayload(saved.id, upgraded);
          } catch (e) {
            console.warn('[RESTORE] elevation self-heal failed (non-fatal)', e);
            // 저장 경로는 elevationSamples 가 v2 페이로드로 이미 들어있을 수도 있어,
            // 여기서는 평지 토스트를 띄우지 않는다(차트 자체는 표시될 수 있음).
          }
        })();
      }

      // 6) Street View prefetch — 비블로킹. 실패해도 경로 주행은 가능.
      (async () => {
        try {
          const initialPrefetchM = speedKmH >= SPEED_THRESHOLD_KMH ? INITIAL_PREFETCH_HIGH_M : INITIAL_PREFETCH_LOW_M;
          setAppPhase('PREPARING');
          setPreparingProgress({ k: 0, n: 1 });
          const { panoData, sampleCount } = await preFetchStreetViewData(
            path,
            (k, n) => setPreparingProgress({ k, n }),
            { maxDistanceM: initialPrefetchM, intervalM: 10 }
          );
          setPreparingProgress(null);
          const coverage = sampleCount > 0 ? panoData.length / sampleCount : 0;
          setRoute((prev) => (prev ? { ...prev, panoData, streetViewCoverage: coverage, streetViewDisabled: coverage < COVERAGE_MIN } : null));
          setAppPhase('IDLE');
        } catch (e) {
          console.warn('[RESTORE] street view prefetch failed (non-fatal)', e);
          setPreparingProgress(null);
          setAppPhase('IDLE');
        }
      })();
    } catch (e) {
      console.error('[RESTORE_FAIL] falling back to OSRM recalculation', e);
      // 오프라인 복원 실패 — 세션 내에서만 calculateRoute 로 폴백(localStorage 는 건드리지 않음).
      // 호출자(handleLoadFavorite)가 실패를 인지할 수 있도록 에러를 올린다.
      throw e;
    } finally {
      setLoading(false);
    }
  }, [elevationProvider, elevationEngine, setPanoramaView, preFetchStreetViewData, speedKmH, updateFavoriteRoutePayload]);

  useEffect(() => {
    restoreRouteFromSavedGeometryRef.current = restoreRouteFromSavedGeometry;
  }, [restoreRouteFromSavedGeometry]);

  // 주행 중 속도가 40 km/h 이상으로 올랐을 때: 해당 위치부터 300m 확장 prefetch 후 주행 재개. 고속→저속으로 내려가면 수집 거리는 그대로 두고 40 이상 상태 유지(ref 미갱신).
  useEffect(() => {
    const prev = prevSpeedKmHRef.current;
    if (!(prev >= SPEED_THRESHOLD_KMH && effectiveSpeedKmH < SPEED_THRESHOLD_KMH)) prevSpeedKmHRef.current = effectiveSpeedKmH;
    if (appPhase !== 'RUNNING' || !route?.path?.length || effectiveSpeedKmH < SPEED_THRESHOLD_KMH || prev >= SPEED_THRESHOLD_KMH) return;
    const path = route.path;
    const currentPathIndex = Math.min(simulation.currentIndex, path.length - 1);
    const cumDist: number[] = [0];
    for (let i = 1; i < path.length; i++) {
      cumDist[i] = cumDist[i - 1] + computeDistanceBetween(path[i - 1], path[i]);
    }
    const currentDistanceM = cumDist[currentPathIndex];
    setSimulation((s) => ({ ...s, isActive: false }));
    setAppPhase('PREPARING');
    setPreparingProgress({ k: 0, n: 1 });
    preFetchStreetViewData(path, (k, n) => setPreparingProgress({ k, n }), {
      fromDistanceM: currentDistanceM,
      maxDistanceM: currentDistanceM + INITIAL_PREFETCH_HIGH_M,
      intervalM: 10
    }).then(({ panoData: newPanoData }) => {
      const kept = (route.panoData || []).filter((p: PanoDataItem) => p.pathIndex < currentPathIndex);
      const merged = [...kept, ...newPanoData];
      setRoute((prevRoute) => (prevRoute ? { ...prevRoute, panoData: merged } : null));
      setPreparingProgress(null);
      setAppPhase('RUNNING');
      setSimulation((s) => ({ ...s, isActive: true }));
    }).catch(() => {
      setPreparingProgress(null);
      setAppPhase('RUNNING');
      setSimulation((s) => ({ ...s, isActive: true }));
    });
  }, [effectiveSpeedKmH, appPhase, route, preFetchStreetViewData]);

  const clearMapOverlays = () => {
    setLockedRouteProfile(null);
    hasShownModePulseRef.current = false;
    setAppPhase('IDLE');
    setPreparingProgress(null);
    setRewardOfferModalStage(null);
    setRewardOfferTargetKm(0);
    setRideLimitMessage(null);
    setMaxRideLimitMessage(null);
    rewardGrantedForRideRef.current = false;
    rewardFirstDeclinedRef.current = false;
    rewardSecondDeclinedRef.current = false;
    rewardSecondOfferShownRef.current = false;
    rideAllowedLimitMetersRef.current = DEFAULT_RIDE_LIMIT_M;
    rideTargetMetersRef.current = DEFAULT_RIDE_LIMIT_M;
    rideStoppedByLimitRef.current = false;
    if (googlePolylineRef.current) { googlePolylineRef.current.setMap(null); googlePolylineRef.current = null; }
    googleMarkersRef.current.forEach(m => m.setMap(null));
    googleMarkersRef.current = [];
    if (simulationMarker.current) { simulationMarker.current.setMap(null); simulationMarker.current = null; }
    startMarker.current = null;
    endMarker.current = null;
    waypointMarkers.current = [];
    if (searchMarkerRef.current) { searchMarkerRef.current.setMap(null); searchMarkerRef.current = null; }
    setRoute(null);
    lastRouteRequestRef.current = null;
    console.log('[SIMULATION_STOP] reason=clear_map');
    setSimulation({ isActive: false, currentIndex: 0, speed: 100 });
    setCoachData(null);
    setRouteSource(null);
    setWaypoints([]);

    // Explicitly clear start and end inputs
    setOrigin('');
    setDestination('');

    // Clear Coordinate Refs
    originLocationRef.current = null;
    destLocationRef.current = null;

    svErrorCount.current = 0;
    setShowSvWarning(false);
    setIsUserPano(false);
    setElapsedTime(0);
    setCoveredDistance(0);
    setAverageRpm(0);
    rpmSampleSumRef.current = 0;
    rpmSampleCountRef.current = 0;
  };

  const restartSimulation = () => {
    if (route && route.path.length > 0) {
      setRewardOfferModalStage(null);
      setRideLimitMessage(null);
      setMaxRideLimitMessage(null);
      rewardSecondDeclinedRef.current = false;
      rewardSecondOfferShownRef.current = false;
      rideStoppedByLimitRef.current = false;
      setSimulation(prev => ({ ...prev, currentIndex: 0, isActive: true }));
      lastCoachedIndex.current = -1;
      lastSpokenValidUntilPathIndex.current = null;
      setElapsedTime(0);
      setCoveredDistance(0);
      setAverageRpm(0);
      rpmSampleSumRef.current = 0;
      rpmSampleCountRef.current = 0;

      const startPos = route.path[0];
      const nextPos = route.path.length > 1 ? route.path[1] : startPos;
      const heading = computeHeading(startPos, nextPos);

      // Update view (Hybrid)
      setPanoramaView(startPos, heading);

      setIsSvFullScreen(true);

      getCourseBriefing(route).then(speak);
    }
  };

  const handleStopSimulation = () => {
    console.log('[SIMULATION_STOP] reason=user_stop');
    setRewardOfferModalStage(null);
    setRewardOfferTargetKm(0);
    setRideLimitMessage(null);
    setMaxRideLimitMessage(null);
    setSimulation(prev => ({ ...prev, isActive: false, currentIndex: 0 }));
    setAppPhase('IDLE');
    lastValidUntilFetched.current = -1;
    isPrefetchingCoachRef.current = false;
    lastCoachSpeakAtMsRef.current = 0;
    lastSpokenResistanceRef.current = null;
    lastSpokenTipIndexRef.current = null;
    setIsSvFullScreen(false);
    setIsUserPano(false);
    // We don't hide panorama instance itself anymore, just the container via isSvActive toggle
    // However, simulation.isActive sets isSvActive state usually in toggle? 
    // Wait, isSvActive was controlled via visibility button. 
    // We should probably hide the SV container when stopped?
    // No, maybe user wants to see it? Let's leave isSvActive state as is, 
    // but the simulation effect won't run.

    setIsCoachThinking(false);
    setCoachData(null);
    setAverageRpm(0);
    rpmSampleSumRef.current = 0;
    rpmSampleCountRef.current = 0;
    lastSpokenValidUntilPathIndex.current = null;
    safeSpeechCancel();
  };

  const handleToggleSimulation = () => {
    setSimulation(prev => {
      const isActive = !prev.isActive;
      if (!isActive) console.log('[SIMULATION_STOP] reason=user_pause');
      if (isActive) {
        // Restore heading/position
        if (route && route.path[prev.currentIndex]) {
          const nextIdx = Math.min(prev.currentIndex + 1, route.path.length - 1);
          const heading = computeHeading(
            route.path[prev.currentIndex],
            route.path[nextIdx]
          );
          setPanoramaView(route.path[prev.currentIndex], heading);
        }
        setIsSvFullScreen(true);
        setIsSvActive(true); // Ensure container is visible
      }
      return { ...prev, isActive };
    });
  };

  const handleToggleStreetView = useCallback(() => {
    const nextActive = !isSvActive;

    // Hide일 때는 Street View 전용 레이아웃 상태도 함께 정리해 map-only 화면을 보장한다.
    if (!nextActive) {
      setIsSvActive(false);
      setIsSvFullScreen(false);
      return;
    }

    setIsSvActive(true);
    if (!route?.path?.length) return;

    const currentIdx = Math.min(Math.max(0, simulation.currentIndex), route.path.length - 1);
    const currentPos = route.path[currentIdx];
    if (!currentPos) return;

    const syncCurrentStreetView = async () => {
      if (route.panoData?.length) {
        const panoItem = getPanoDataForIndex(route.panoData, currentIdx);
        if (panoItem) {
          svDisplayPathIndexRef.current = currentIdx;
          lastSvDisplayUpdateRef.current = Date.now();
          lastDisplayedPanoPathIndexRef.current = panoItem.pathIndex;
          await setPanoramaViewByPanoId(panoItem.panoId, panoItem.heading, panoItem.isUserPhoto);
          setShowSvWarning(false);
          return;
        }
      }

      const nextPos = route.path[Math.min(currentIdx + 1, route.path.length - 1)] || currentPos;
      const heading = computeHeading(currentPos, nextPos);
      await setPanoramaView(currentPos, heading);
    };

    void syncCurrentStreetView();
  }, [
    getPanoDataForIndex,
    isSvActive,
    route,
    setPanoramaView,
    setPanoramaViewByPanoId,
    simulation.currentIndex,
  ]);

  /** 주행 위치 강제 이동: 시뮬 타이머/경로는 유지하고 currentIndex만 변경. 맵/마커/거리뷰/표고는 기존 effect가 동기화. */
  const jumpToRouteIndex = (targetIndex: number) => {
    if (!route?.path?.length) return;
    const clamped = Math.max(0, Math.min(targetIndex, route.path.length - 1));
    svDisplayPathIndexRef.current = clamped;
    lastDisplayedPanoPathIndexRef.current = clamped - 1;
    lastSvDisplayUpdateRef.current = Date.now();
    setSimulation(prev => ({ ...prev, currentIndex: clamped }));
    const coord = route.path[clamped];
    const lat = typeof coord.lat === 'function' ? coord.lat() : coord.lat;
    const lng = typeof coord.lng === 'function' ? coord.lng() : coord.lng;
    googleMapRef.current?.panTo({ lat, lng });
  };

  const calculateRoute = useCallback(async (
    targetMode?: TravelMode,
    autoStart: boolean = false,
    customOrigin?: string,
    customDestination?: string,
    customWaypoints?: { name: string, location: any }[],
    hydrateFavoriteId?: string
  ) => {
    if (!hydrateFavoriteId) setLockedRouteProfile(null);
    const activeMode = targetMode || mode;
    const finalOrigin = customOrigin || origin;
    const finalDestination = customDestination || destination;
    const activeWaypoints = customWaypoints || waypoints;

    if (!finalOrigin || !finalDestination) return;

    // Log calculateRoute call for debugging excessive API calls
    const routeCallTime = new Date().toISOString();
    const stackTrace = new Error().stack || '';
    const caller = stackTrace.split('\n')[2]?.trim() || 'unknown';
    const routeCallInfo = {
      timestamp: routeCallTime,
      origin: finalOrigin.substring(0, 50), // Truncate for readability
      destination: finalDestination.substring(0, 50),
      mode: activeMode,
      autoStart,
      hasWaypoints: activeWaypoints.length > 0,
      caller: caller
    };
    console.log('[CALCULATE_ROUTE_CALL]', JSON.stringify(routeCallInfo, null, 2));

    setLoading(true);
    setCoachData(null);
    setRouteSource(null);
    setElapsedTime(0);
    setCoveredDistance(0);
    setAverageRpm(0);
    rpmSampleSumRef.current = 0;
    rpmSampleCountRef.current = 0;
    lastCoachedIndex.current = -1;
    if (googlePolylineRef.current) { googlePolylineRef.current.setMap(null); googlePolylineRef.current = null; }
    // OSRM only (no Google Directions). Geocoding: Nominatim only.

    // OSRM 좌표: ref(맵 클릭·추천 선택·저장 경로 스냅)가 있으면 그 좌표만 사용한다.
    // 입력란 문자열은 표시/저장용이며, ref 가 유효할 때 addressToCoord 로 재주입하지 않는다.

    try {
      const isFiniteRoutingPoint = (val: unknown): boolean => {
        if (val == null || typeof val !== 'object') return false;
        const v = val as { lat?: unknown; lng?: unknown };
        if (typeof v.lat === 'function' && typeof v.lng === 'function') {
          const lat = (v.lat as () => number)();
          const lng = (v.lng as () => number)();
          return Number.isFinite(lat) && Number.isFinite(lng);
        }
        return Number.isFinite(v.lat as number) && Number.isFinite(v.lng as number);
      };
      const originRoutingPoint = isFiniteRoutingPoint(originLocationRef.current) ? originLocationRef.current : null;
      const destRoutingPoint = isFiniteRoutingPoint(destLocationRef.current) ? destLocationRef.current : null;

      const getCoord = async (routingPoint: any, addressFallback: string, which: 'origin' | 'destination') => {
        if (routingPoint != null && isFiniteRoutingPoint(routingPoint)) {
          if (typeof routingPoint.lat === 'function' && typeof routingPoint.lng === 'function') return routingPoint;
          return new google.maps.LatLng(routingPoint.lat, routingPoint.lng);
        }
        const trimmed = String(addressFallback || '').trim();
        if (!trimmed) {
          throw new Error(`[OSRM] ${which}: 고정 좌표 없고 주소도 비어 있음`);
        }
        const res = await nominatim.addressToCoord(trimmed);
        return new google.maps.LatLng(res.lat, res.lng);
      };
      const toLatLng = (p: any) => {
        if (!p) return null;
        if (typeof p.lat === 'function' && typeof p.lng === 'function') return p;
        const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
        const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
        if (lat != null && lng != null && typeof google !== 'undefined' && google.maps?.LatLng) return new google.maps.LatLng(lat, lng);
        return null;
      };

      let path: any[] = [];
      let distText = '';
      let durText = '';
      let originLatLngOuter: any = null;
      let destLatLngOuter: any = null;
      try {
        const originLatLng = await getCoord(originRoutingPoint, finalOrigin, 'origin');
        const destLatLng = await getCoord(destRoutingPoint, finalDestination, 'destination');
        originLatLngOuter = originLatLng;
        destLatLngOuter = destLatLng;
        const wpLatLngs = activeWaypoints.map(wp => toLatLng(wp.location)).filter(Boolean) as any[];
        const profile = activeMode === TravelMode.DRIVING ? 'driving' : activeMode === TravelMode.BICYCLING ? 'cycling' : 'foot';
        const coords = [originLatLng, ...wpLatLngs, destLatLng].map(p => `${p.lng()},${p.lat()}`).join(';');
        const data = Capacitor.isNativePlatform()
          ? await fetchOsrmRouteJson(profile, coords)
          : await (await fetch(`/api/osrm-route?profile=${encodeURIComponent(profile)}&coords=${encodeURIComponent(coords)}`)).json();
        if (data.code === 'Ok') {
          const decoded = decodePath(data.routes[0].geometry);
          lastOsrmDecodedPathRef.current = decoded.map(([lat, lng]) => [fix8(lat), fix8(lng)] as [number, number]);
          path = decoded.map(([lat, lng]) => new google.maps.LatLng(lat, lng));
          distText = `${(data.routes[0].distance / 1000).toFixed(1)} km`;
          durText = formatDurationSimple(data.routes[0].duration);
          setRouteSource('OSRM');
          if (googleMapRef.current && path.length) {
            const bounds = new google.maps.LatLngBounds();
            path.forEach((p: any) => bounds.extend(p));
            googleMapRef.current.fitBounds(bounds);
          }
        }
      } catch (e) {
        console.error('[OSRM_ERROR]', e);
        setLoading(false);
        return;
      }
      if (path.length > 0) {
        // Log Elevation API call for debugging
        const elevationCallTime = new Date().toISOString();
        const elevationCallInfo = {
          timestamp: elevationCallTime,
          origin: finalOrigin,
          destination: finalDestination,
          pathLength: path.length,
          mode: activeMode,
          stackTrace: new Error().stack
        };
        console.log('[ELEVATION_API_CALL]', JSON.stringify(elevationCallInfo, null, 2));

        let elevationRes: { results: Array<{ location: any; elevation: number; resolution: number }> };
        try {
          const samples = openElevation.elevationSamplesForPath(path.length);
          const openRes = await fetchElevationAlongOsrmPath(path, samples, activeMode);
          const smoothed = openElevation.smoothElevations(openRes.results.map((r) => r.elevation));
          elevationRes = {
            results: applyRoadElevationModel(
              openRes.results.map((r, i) => ({
                elevation: smoothed[i] ?? r.elevation,
                location: new google.maps.LatLng(r.latitude, r.longitude),
                resolution: 0
              }))
            )
          };
          // 디버그 배지: 어느 공급자가 응답을 만들었는지 표시
          const usedProvider = (openRes as { usedProvider?: 'open-elevation' | 'opentopodata' }).usedProvider;
          setElevationStatus({ kind: 'ok', provider: usedProvider });
        } catch (e) {
          console.warn('[ELEVATION_ERROR] fallback_to_flat_profile', e);
          // Elevation API 실패(안드로이드 WebView TLS/네트워크 등) 시에도
          // OSRM 경로 자체는 유효하므로 평지(고도 0)로 진행한다.
          showElevationFlatToast();
          elevationRes = {
            results: path.map((p: any) => ({
              elevation: 0,
              location: p,
              resolution: 0
            }))
          };
        }

        // Duration: Car, Bike, Foot 모두 선택 속도(speedKmH) + 경사 보정으로 동일 계산 (실내 사이클 사용자 경로 선택 일관성)
        let calculatedSeconds = 0;
        const points = elevationRes.results;

        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];
          const dist = computeDistanceBetween(p1.location, p2.location);

          if (dist > 0) {
            const elevationChange = p2.elevation - p1.elevation;
            const grade = (elevationChange / dist) * 100;

            // Grade adjustments recommended by Fitness Expert
            let factor = 1.0;
            if (grade <= -6) factor = 1.35; // Steep descent
            else if (grade <= -3) factor = 1.25; // Descent
            else if (grade <= -1) factor = 1.10; // Mild descent
            else if (grade < 1) factor = 1.00; // Flat
            else if (grade < 3) factor = 0.85; // Mild ascent
            else if (grade < 6) factor = 0.70; // Ascent
            else factor = 0.50; // Steep ascent (> 6%)

            // V = V0 * factor
            const adjustedSpeedMs = (speedKmH * 1000 / 3600) * factor;
            calculatedSeconds += (dist / adjustedSpeedMs);
          }
        }

        durText = formatDurationSimple(calculatedSeconds);

        const densifiedPath = [];
        const segmentLength = 10;
        for (let i = 0; i < path.length - 1; i++) {
          const p1 = path[i];
          const p2 = path[i + 1];
          densifiedPath.push(p1);
          const dist = computeDistanceBetween(p1, p2);
          if (dist > segmentLength) {
            const stepCount = Math.floor(dist / segmentLength);
            const heading = computeHeading(p1, p2);
            for (let j = 1; j <= stepCount; j++) {
              const nextPt = computeOffset(p1, j * segmentLength, heading);
              densifiedPath.push(new google.maps.LatLng(nextPt.lat, nextPt.lng));
            }
          }
        }
        densifiedPath.push(path[path.length - 1]);
        const oldMarkers = [startMarker.current, endMarker.current, ...waypointMarkers.current].filter(Boolean);
        oldMarkers.forEach(m => m.setMap(null));
        googleMarkersRef.current = googleMarkersRef.current.filter(m => !oldMarkers.includes(m));
        startMarker.current = null;
        endMarker.current = null;
        waypointMarkers.current = [];
        if (googlePolylineRef.current) { googlePolylineRef.current.setMap(null); googlePolylineRef.current = null; }
        startMarker.current = createCustomMarker(densifiedPath[0], 'A', '#3b82f6');
        endMarker.current = createCustomMarker(densifiedPath[densifiedPath.length - 1], 'B', '#ef4444');
        activeWaypoints.forEach((wp, idx) => {
          waypointMarkers.current.push(createCustomMarker(wp.location, (idx + 1).toString(), '#f59e0b'));
        });
        const gmap = googleMapRef.current;
        if (gmap) {
          const pathForPoly = densifiedPath.map((p: any) => ({ lat: p.lat(), lng: p.lng() }));
          googlePolylineRef.current = new google.maps.Polyline({ path: pathForPoly, strokeColor: '#ff3020', strokeWeight: 5, clickable: true });
          googlePolylineRef.current.setMap(gmap);
          googlePolylineRef.current.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (e.latLng) handleLocationClickRef.current(e.latLng.lat(), e.latLng.lng());
          });
        }
        setRoute({ origin: finalOrigin, destination: finalDestination, distance: distText, duration: durText, path: densifiedPath, elevation: elevationRes.results ?? [] });
        if (hydrateFavoriteId && densifiedPath.length > 0) {
          const densifiedLatLng: [number, number][] = densifiedPath.map((p: any) => [fix8(p.lat()), fix8(p.lng())]);
          const fullGeom: [number, number][] = lastOsrmDecodedPathRef.current?.length
            ? lastOsrmDecodedPathRef.current.slice()
            : densifiedLatLng.slice();
          const cumulative = computeCumulativeDistances(densifiedLatLng);
          const totalM = cumulative[cumulative.length - 1] ?? 0;
          const elevationSamples: [number, number, number][] = (elevationRes.results ?? [])
            .map((r: any) => {
              const loc = r.location;
              const lat = typeof loc?.lat === 'function' ? loc.lat() : loc?.lat;
              const lng = typeof loc?.lng === 'function' ? loc.lng() : loc?.lng;
              return [fix8(lat), fix8(lng), Number((Number(r.elevation) || 0).toFixed(3))] as [number, number, number];
            });
          const originSrc = originLatLngOuter ?? densifiedPath[0];
          const destSrc = destLatLngOuter ?? densifiedPath[densifiedPath.length - 1];
          const payload: SavedRoutePayload = {
            schemaVersion: SAVED_ROUTE_PAYLOAD_VERSION,
            provider: 'osrm',
            profile: profileFromMode(activeMode),
            distance: distText,
            duration: durText,
            fullGeometry: fullGeom,
            densifiedGeometry: densifiedLatLng,
            cumulativeDistances: cumulative.map(d => Number(d.toFixed(2))),
            ...(elevationSamples.length ? { elevationSamples } : {}),
            totalDistanceMeters: Number(totalM.toFixed(2)),
            originLatLng: toLatLngPair(originSrc),
            destLatLng: toLatLngPair(destSrc),
            waypointLatLngs: activeWaypoints.map(wp => toLatLngPair(wp.location)),
            createdAt: Date.now()
          };
          updateFavoriteRoutePayload(hydrateFavoriteId, payload);
        }
        lastRouteRequestRef.current = { origin: String(finalOrigin).trim(), destination: String(finalDestination).trim(), waypointNames: activeWaypoints.map(w => (w.name || '').trim()), mode: activeMode };

        // [경로 전환 시 거리뷰 멈춤 방지] 새 path 설정 직후 시뮬레이션·거리뷰 ref 리셋 (방안 1·3)
        console.log('[SIMULATION_STOP] reason=route_recalculated');
        setSimulation({ isActive: false, currentIndex: 0, speed: 100 });
        setAppPhase('IDLE');
        svDisplayPathIndexRef.current = 0;
        lastDisplayedPanoPathIndexRef.current = -1;
        lastSvDisplayUpdateRef.current = 0;
        lastCoachedIndex.current = -1;

        // 의도한 UX만: Car/Bike/Foot으로 새 경로 계산된 경우에만 Go 버튼 펄스 (주행 중·Go 클릭 시에는 미동작)
        if (!autoStart) {
          goButtonPulseTimeoutsRef.current.forEach((t) => clearTimeout(t));
          goButtonPulseTimeoutsRef.current = [];
          setGoButtonPulse(true);
          goButtonPulseTimeoutsRef.current.push(window.setTimeout(() => setGoButtonPulse(false), 400));
          goButtonPulseTimeoutsRef.current.push(window.setTimeout(() => setGoButtonPulse(true), 800));
          goButtonPulseTimeoutsRef.current.push(window.setTimeout(() => setGoButtonPulse(false), 1200));
        }

        // (방안 2) 새 경로 시작점으로 거리뷰 즉시 이동 — 이전 경로 화면에 멈춰 보이는 시간 제거
        if (densifiedPath.length > 0) {
          const startPos = densifiedPath[0];
          const heading = densifiedPath.length > 1 ? computeHeading(startPos, densifiedPath[1]) : 0;
          setPanoramaView(startPos, heading);
        }

        // Progressive loading: pre-fetch distance by speed (≥40 km/h: 300m, <40: 100m); rest loaded on-demand
        (async () => {
          const initialPrefetchM = speedKmH >= SPEED_THRESHOLD_KMH ? INITIAL_PREFETCH_HIGH_M : INITIAL_PREFETCH_LOW_M;
          setAppPhase('PREPARING');
          setPreparingProgress({ k: 0, n: 1 });
          const { panoData, sampleCount } = await preFetchStreetViewData(
            densifiedPath,
            (k, n) => setPreparingProgress({ k, n }),
            { maxDistanceM: initialPrefetchM, intervalM: 10 }
          );
          setPreparingProgress(null);
          const coverage = sampleCount > 0 ? panoData.length / sampleCount : 0;
          setRoute((prev) => (prev ? { ...prev, panoData, streetViewCoverage: coverage, streetViewDisabled: coverage < COVERAGE_MIN } : null));
          setAppPhase('IDLE');

          if (autoStart) {
            countdownDoneRef.current = async () => {
              const r = routeRef.current;
              if (r) await startSimulationOnly(r);
            };
            setCountdown(3);
          }
        })();
      }
    } catch (err) {
      console.error('[CALCULATE_ROUTE_FINAL_ERROR]', {
        timestamp: new Date().toISOString(),
        origin: finalOrigin.substring(0, 50),
        destination: finalDestination.substring(0, 50),
        error: err instanceof Error ? err.message : String(err)
      });
      alert("경로를 찾을 수 없습니다.");
    }
    finally { setLoading(false); }
  }, [origin, destination, waypoints, mode, speedKmH, elevationEngine, elevationProvider, setPanoramaView, preFetchStreetViewData, setPanoramaViewByPanoId, updateFavoriteRoutePayload]);

  /** Core: actually starts ride (sets panorama, coaching, timers). Reward logic calls this. */
  const startSimulationCore = useCallback(async (currentRoute: RouteInfo) => {
    setRideLimitMessage(null);
    setMaxRideLimitMessage(null);
    setRewardOfferModalStage(null);
    setIsCoachThinking(false);

    setElapsedTime(0);
    setCoveredDistance(0);
    // 이전 ride 의 coachData 가 isActive=true 전환 직후 잠깐 표시되는 문제 방지.
    // 새 coachData 는 getPredictiveCoaching 완료 후 아래에서 세팅된다.
    setCoachData(null);
    // 이전 ride 의 캐시된 코칭/pano 데이터가 새 세그먼트에 섞여 들어오지 않도록 비움.
    setRoute((prev) => (prev ? { ...prev, cachedCoaching: [] } : prev));
    rideStoppedByLimitRef.current = false;
    lastCoachedIndex.current = -1;
    lastValidUntilFetched.current = -1;
    lastSpokenValidUntilPathIndex.current = null;
    isPrefetchingCoachRef.current = false;
    // 주기 발화 상태 초기화 — 첫 tip 발화 시점에 lastCoachSpeakAtMs 가 세팅되므로
    // 여기서는 Date.now() 로 먼저 채워 두어 곧바로 주기 재추첨이 터지지 않게 한다.
    lastCoachSpeakAtMsRef.current = Date.now();
    lastSpokenResistanceRef.current = null;
    lastSpokenTipIndexRef.current = null;

    const pathLen = currentRoute.path.length;
    // Start after first StreetView (or map fallback) is visible.
    const firstPano = currentRoute.panoData && currentRoute.panoData.length > 0 ? currentRoute.panoData[0] : null;
    if (firstPano) {
      await setPanoramaViewByPanoId(firstPano.panoId, firstPano.heading, firstPano.isUserPhoto);
    } else if (pathLen > 0) {
      setShowSvWarning(true);
      const startPos = currentRoute.path[0];
      const heading = pathLen > 1 ? computeHeading(startPos, currentRoute.path[1]) : 0;
      await setPanoramaView(startPos, heading);
    }

    // 첫 코칭 발화/음악 루프 등 ref 기반 로직이 React state effect 를 기다리지 않게 즉시 반영한다.
    simulationActiveRef.current = true;
    setSimulation({ isActive: true, currentIndex: 0, speed: 100 });
    setAppPhase('RUNNING');
    setIsSvFullScreen(true);
    setIsSvActive(true);

    const elevLen = currentRoute.elevation.length;
    const segmentSize = Math.min(20, elevLen);
    const upcomingSlice = currentRoute.elevation.slice(0, segmentSize);
    if (upcomingSlice.length > 0) {
      setIsCoachThinking(true);
      try {
        const { coaching, validUntilPathIndex } = await getPredictiveCoaching(upcomingSlice, pathLen, elevLen, 0, speedKmH);
        // 메인 effect 가 setRoute 이후 flush 시점에 같은 세그먼트로 중복 speak 하지 않도록
        // state 변경 이전에 먼저 마킹한다. (cancel-speak-cancel 로 인한 Android TTS 멈춤 방지)
        lastSpokenValidUntilPathIndex.current = validUntilPathIndex;
        // 메인 effect 의 주기 발화 트리거가 첫 tick 에 곧바로 터지지 않도록 발화 이력 선점.
        lastSpokenResistanceRef.current = coaching.resistance;
        setCoachData(coaching);
        setRoute((prev) => (prev ? { ...prev, cachedCoaching: [{ coaching, validUntilPathIndex }] } : null));
        // 첫 코칭은 주행 시작 직후 바로 발화한다.
        // 이전처럼 briefing 후 setTimeout 으로 tip 을 미루면 ref 갱신 타이밍에 따라 첫 tip 이 누락되고,
        // 사용자에게는 30초 주기 재발화가 첫 코칭처럼 들릴 수 있다.
        if (coaching.tip) speak(coaching.tip);
        lastCoachSpeakAtMsRef.current = Date.now();
      } finally {
        setIsCoachThinking(false);
      }
    }
    lastCoachedIndex.current = 0;
  }, [speedKmH, setPanoramaView, setPanoramaViewByPanoId]);

  /** Start simulation using existing route. Applies rewarded video extension rules. */
  const startSimulationOnly = useCallback(async (currentRoute: RouteInfo) => {
    setRideLimitMessage(null);
    setMaxRideLimitMessage(null);

    // Reset per-ride reward flags (reward can be granted during modal choices).
    rewardPendingRouteRef.current = currentRoute;
    rewardGrantedForRideRef.current = false;
    rewardFirstDeclinedRef.current = false;
    rewardSecondDeclinedRef.current = false;
    rewardSecondOfferShownRef.current = false;
    rideStoppedByLimitRef.current = false;

    const routeKm = (() => {
      const n = parseFloat(currentRoute.distance || '');
      return Number.isFinite(n) ? n : 0;
    })();
    const routeMeters = routeKm * 1000;

    rideTargetMetersRef.current = routeMeters;
    rideAllowedLimitMetersRef.current = DEFAULT_RIDE_LIMIT_M;

    // <= 5km: no reward gating
    if (routeMeters <= DEFAULT_RIDE_LIMIT_M) {
      setRewardOfferTargetKm(0);
      rideAllowedLimitMetersRef.current = routeMeters;
      await startSimulationCore(currentRoute);
      return;
    }

    // > 50km: not available yet (future paid service)
    if (routeMeters > MAX_RIDE_LIMIT_M) {
      setMaxRideLimitMessage('Routes longer than 50 km are not available yet.');
      return;
    }

    // 5km < distance <= 50km: offer rewarded ad
    if (!admobReady || !Capacitor.isNativePlatform()) {
      // Fallback: ads unavailable → allow default 5km ride.
      rewardFirstDeclinedRef.current = true;
      rideAllowedLimitMetersRef.current = DEFAULT_RIDE_LIMIT_M;
      await startSimulationCore(currentRoute);
      return;
    }

    setRewardOfferTargetKm(routeKm);
    setRewardOfferModalStage('FIRST');
  }, [startSimulationCore, admobReady]);

  const grantRideExtensionFromRewardedAd = useCallback(async (): Promise<boolean> => {
    if (!admobReady) return false;
    if (!Capacitor.isNativePlatform()) return false;
    if (rewardAdInFlightRef.current) return false;

    rewardAdInFlightRef.current = true;
    try {
      if (!rewardPreparedRef.current) {
        if (!rewardPreparePromiseRef.current) {
          rewardPreparePromiseRef.current = AdMob.prepareRewardVideoAd({
            adId: ADMOB_REWARD_VIDEO_AD_UNIT_ID,
          } satisfies RewardAdOptions)
            .then(() => { rewardPreparedRef.current = true; })
            .catch((e) => {
              rewardPreparedRef.current = false;
              console.warn('[AdMob] rewarded prepare failed', e);
            })
            .finally(() => { rewardPreparePromiseRef.current = null; });
        }
        await rewardPreparePromiseRef.current;
      }

      // If this resolves, user has earned the reward.
      const rewardItem = await AdMob.showRewardVideoAd();
      if (!rewardItem) return false;

      rewardGrantedForRideRef.current = true;
      rideAllowedLimitMetersRef.current = rideTargetMetersRef.current;
      return true;
    } catch (e) {
      console.warn('[AdMob] rewarded ad failed', e);
      return false;
    } finally {
      rewardAdInFlightRef.current = false;
      rewardPreparedRef.current = false;

      // Best-effort re-prepare for a future second attempt.
      void AdMob.prepareRewardVideoAd({
        adId: ADMOB_REWARD_VIDEO_AD_UNIT_ID,
      } satisfies RewardAdOptions)
        .then(() => { rewardPreparedRef.current = true; })
        .catch(() => { rewardPreparedRef.current = false; });
    }
  }, [admobReady]);

  const handleRewardWatchFirst = useCallback(async () => {
    const r = rewardPendingRouteRef.current;
    if (!r) return;
    setRewardOfferModalStage(null);

    const granted = await grantRideExtensionFromRewardedAd();
    if (!granted) {
      // Fallback: start normally with the default 5 km cap.
      rewardFirstDeclinedRef.current = true;
      rideAllowedLimitMetersRef.current = DEFAULT_RIDE_LIMIT_M;
    }
    await startSimulationCore(r);
  }, [grantRideExtensionFromRewardedAd, startSimulationCore]);

  const handleRewardStartWithDefault = useCallback(async () => {
    const r = rewardPendingRouteRef.current;
    if (!r) return;
    setRewardOfferModalStage(null);

    rewardFirstDeclinedRef.current = true;
    rewardGrantedForRideRef.current = false;
    rideAllowedLimitMetersRef.current = DEFAULT_RIDE_LIMIT_M;
    await startSimulationCore(r);
  }, [startSimulationCore]);

  const handleRewardWatchSecond = useCallback(async () => {
    setRewardOfferModalStage(null);

    const granted = await grantRideExtensionFromRewardedAd();
    // Even if ad fails, resume ride with the current allowance cap.
    if (granted) {
      // rideAllowedLimitMetersRef is already extended by grantRideExtensionFromRewardedAd()
    }

    setAppPhase('RUNNING');
    setSimulation(prev => ({ ...prev, isActive: true }));
  }, [grantRideExtensionFromRewardedAd]);

  const handleRewardDeclineSecond = useCallback(() => {
    setRewardOfferModalStage(null);
    rewardSecondDeclinedRef.current = true;
    setAppPhase('RUNNING');
    setSimulation(prev => ({ ...prev, isActive: true }));
  }, []);

  const handleSetStart = () => {
    if (clickedLocation) {
      setLockedRouteProfile(null);
      hasShownModePulseRef.current = false;
      const resolvedName =
        clickedLocation.name && clickedLocation.name !== 'Loading...'
          ? clickedLocation.name
          : clickedLocation.address;
      const newOrigin = toHumanAddress(resolvedName);
      originJustSelectedRef.current = true;
      originSetFromMapClickRef.current = true;
      setOrigin(newOrigin);
      setOriginSuggestions([]);
      setShowOriginSuggestions(false);
      setOriginHighlightIndex(-1);
      originLocationRef.current = clickedLocation.location; // CAPTURE EXACT COORDINATES
      if (isPendingMapAddress(resolvedName)) {
        const { lat, lng } = clickedLocation;
        void resolveNearestAddress(lat, lng).then((addr) => {
          const finalAddr = toHumanAddress(addr);
          setOrigin((prev) => (isPendingMapAddress(prev) ? finalAddr : prev));
        });
      }

      if (startMarker.current) { startMarker.current.setMap(null); googleMarkersRef.current = googleMarkersRef.current.filter(m => m !== startMarker.current); }
      startMarker.current = createCustomMarker(clickedLocation.location, 'A', '#3b82f6');

      setClickedLocation(null);
    }
  };

  const handleSetEnd = () => {
    if (clickedLocation) {
      setLockedRouteProfile(null);
      hasShownModePulseRef.current = false;
      const resolvedName =
        clickedLocation.name && clickedLocation.name !== 'Loading...'
          ? clickedLocation.name
          : clickedLocation.address;
      const newDest = toHumanAddress(resolvedName);
      destJustSelectedRef.current = true;
      destSetFromMapClickRef.current = true;
      setDestination(newDest);
      setDestinationSuggestions([]);
      setShowDestinationSuggestions(false);
      setDestinationHighlightIndex(-1);
      destLocationRef.current = clickedLocation.location; // CAPTURE EXACT COORDINATES
      if (isPendingMapAddress(resolvedName)) {
        const { lat, lng } = clickedLocation;
        void resolveNearestAddress(lat, lng).then((addr) => {
          const finalAddr = toHumanAddress(addr);
          setDestination((prev) => (isPendingMapAddress(prev) ? finalAddr : prev));
        });
      }

      if (endMarker.current) { endMarker.current.setMap(null); googleMarkersRef.current = googleMarkersRef.current.filter(m => m !== endMarker.current); }
      endMarker.current = createCustomMarker(clickedLocation.location, 'B', '#ef4444');

      setClickedLocation(null);
    }
  };

  const handleSwapEndpoints = () => {
    setLockedRouteProfile(null);
    originSetFromSwapRef.current = true;
    destSetFromSwapRef.current = true;
    const tempOrigin = origin;
    const newOrigin = destination;
    const newDestination = tempOrigin;
    const newWaypoints = [...waypoints].reverse();

    // SWAP EXACT COORDINATES
    const tempLoc = originLocationRef.current;
    originLocationRef.current = destLocationRef.current;
    destLocationRef.current = tempLoc;

    setOrigin(newOrigin);
    setDestination(newDestination);
    setWaypoints(newWaypoints);
  };

  const handleAddWaypoint = () => {
    if (clickedLocation && waypoints.length < 3) {
      setLockedRouteProfile(null);
      const wpName = clickedLocation.name || clickedLocation.address;
      const newWaypoints = [...waypoints, { name: wpName, location: clickedLocation.location }];
      setWaypoints(newWaypoints);

      const m = createCustomMarker(clickedLocation.location, (waypoints.length + 1).toString(), '#f59e0b');
      waypointMarkers.current.push(m);

      setClickedLocation(null);
    }
  };

  const handleRemoveWaypoint = (idx: number) => {
    setLockedRouteProfile(null);
    const newWaypoints = waypoints.filter((_, i) => i !== idx);
    setWaypoints(newWaypoints);

    if (waypointMarkers.current[idx]) {
      waypointMarkers.current[idx].setMap(null);
      googleMarkersRef.current = googleMarkersRef.current.filter(m => m !== waypointMarkers.current[idx]);
      waypointMarkers.current.splice(idx, 1);
      // 남은 웨이포인트 마커 라벨을 1, 2, … 로 재정렬
      waypointMarkers.current.forEach((m, i) => {
        m.setOptions({ label: { text: (i + 1).toString(), color: 'white', fontWeight: 'bold', fontSize: '14px' } });
      });
    }
  };

  const handleSelectOriginSuggestion = (item: SearchSuggestionItem) => {
    originJustSelectedRef.current = true;
    setOrigin(item.display_name);
    originLocationRef.current = { lat: item.lat, lng: item.lng };
    setOriginSuggestions([]);
    setShowOriginSuggestions(false);
    setOriginHighlightIndex(-1);
  };

  const handleSelectDestinationSuggestion = (item: SearchSuggestionItem) => {
    destJustSelectedRef.current = true;
    setDestination(item.display_name);
    destLocationRef.current = { lat: item.lat, lng: item.lng };
    setDestinationSuggestions([]);
    setShowDestinationSuggestions(false);
    setDestinationHighlightIndex(-1);
  };

  const handleRemoveStart = () => {
    setOrigin('');
    originLocationRef.current = null;
    setOriginSuggestions([]);
    setShowOriginSuggestions(false);
    if (startMarker.current) {
      startMarker.current?.setMap(null);
      googleMarkersRef.current = googleMarkersRef.current.filter(m => m !== startMarker.current);
      startMarker.current = null;
    }
  };

  const handleRemoveEnd = () => {
    setDestination('');
    destLocationRef.current = null;
    setDestinationSuggestions([]);
    setShowDestinationSuggestions(false);
    if (endMarker.current) {
      endMarker.current?.setMap(null);
      googleMarkersRef.current = googleMarkersRef.current.filter(m => m !== endMarker.current);
      endMarker.current = null;
    }
  };

  const clearPlaceSearchMarker = () => {
    if (searchMarkerRef.current) {
      searchMarkerRef.current.setMap(null);
      googleMarkersRef.current = googleMarkersRef.current.filter(m => m !== searchMarkerRef.current);
      searchMarkerRef.current = null;
    }
    if (searchMarkerCloseOverlayRef.current) {
      searchMarkerCloseOverlayRef.current.setMap(null);
      searchMarkerCloseOverlayRef.current = null;
    }
  };

  const createPlaceMarkerCloseOverlay = (lat: number, lng: number, map: any) => {
    const overlay = new google.maps.OverlayView();
    overlay.onAdd = function () {
      const div = document.createElement('button');
      div.type = 'button';
      div.title = '검색 포인트 닫기';
      div.setAttribute('aria-label', '검색 포인트 닫기');
      div.style.position = 'absolute';
      div.style.width = '14px';
      div.style.height = '14px';
      div.style.border = '1px solid #ffffff';
      div.style.borderRadius = '9999px';
      div.style.background = '#ef4444';
      div.style.color = '#ffffff';
      div.style.fontSize = '10px';
      div.style.fontWeight = '700';
      div.style.lineHeight = '12px';
      div.style.padding = '0';
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.justifyContent = 'center';
      div.style.cursor = 'pointer';
      div.style.boxShadow = '0 1px 4px rgba(0,0,0,0.35)';
      div.style.transform = 'translate(-2px, -24px)';
      div.textContent = 'x';
      div.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearPlaceSearchMarker();
      });
      this.div = div;
      const panes = this.getPanes();
      panes?.overlayMouseTarget?.appendChild(div);
    };
    overlay.draw = function () {
      if (!this.div) return;
      const projection = this.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(lat, lng));
      if (!point) return;
      this.div.style.left = `${point.x}px`;
      this.div.style.top = `${point.y}px`;
    };
    overlay.onRemove = function () {
      if (this.div?.parentNode) this.div.parentNode.removeChild(this.div);
      this.div = null;
    };
    overlay.setMap(map);
    searchMarkerCloseOverlayRef.current = overlay;
  };

  const applyPlaceSearchOnMap = (lat: number, lng: number, recentLabel: string) => {
    const map = googleMapRef.current;
    if (!map) return;
    map.setCenter({ lat, lng });
    map.setZoom(16);
    clearPlaceSearchMarker();
    searchMarkerRef.current = new google.maps.Marker({
      position: { lat, lng },
      map,
      label: { text: 'P', color: 'white', fontWeight: 'bold', fontSize: '12px' },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
    });
    googleMarkersRef.current.push(searchMarkerRef.current);
    createPlaceMarkerCloseOverlay(lat, lng, map);
    setRecentPlaceSearches(prev => {
      const filtered = prev.filter(item => item !== recentLabel);
      const updated = [recentLabel, ...filtered].slice(0, 5);
      localStorage.setItem('recent_places', JSON.stringify(updated));
      return updated;
    });
    // 검색 후 맵 이동이 완료되면 상단 검색 패널(최근 검색 포함)을 닫는다.
    setSearchExpanded(false);
  };

  const handleSelectPlaceSearchSuggestion = (item: SearchSuggestionItem) => {
    placeJustSelectedRef.current = true;
    setSearchTerm(item.display_name);
    setPlaceSearchSuggestions([]);
    setShowPlaceSearchSuggestions(false);
    setPlaceSearchHighlightIndex(-1);
    applyPlaceSearchOnMap(item.lat, item.lng, item.display_name);
  };

  const handlePlaceSearch = async (term?: string) => {
    const query = (term ?? searchTerm).trim();
    if (!query || !googleMapRef.current) return;
    setShowPlaceSearchSuggestions(false);
    setPlaceSearchHighlightIndex(-1);
    try {
      const res = await nominatim.search(query);
      applyPlaceSearchOnMap(res.lat, res.lng, query);
      setSearchTerm(query);
    } catch { /* ignore */ }
  };

  const handlePlaceHistoryClick = (term: string) => {
    setSearchTerm(term);
    handlePlaceSearch(term);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setPlaceSearchSuggestions([]);
    setShowPlaceSearchSuggestions(false);
    setPlaceSearchHighlightIndex(-1);
    setClickedLocation(null);
    clearPlaceSearchMarker();
  };

  const handleToggleMapType = () => {
    const next = mapType === 'roadmap' ? 'hybrid' : 'roadmap';
    setMapType(next);
    if (googleMapRef.current) googleMapRef.current.setMapTypeId(next);
  };

  // Android WebView에서 일부 터치가 click으로 승격되지 않는 경우가 있어,
  // 상단 핵심 버튼은 touchend에서도 동일 액션을 실행하도록 보강.
  const stopPointerPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const activateFromTouchEnd = (e: React.TouchEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    action();
  };

  const isSaved = isCurrentRouteSaved();
  return (
    <div className="fixed inset-0 bg-slate-900 overflow-hidden font-sans">
      {/* LCP용: 지도 로드 전 껍데기 — bike_conti_128.png + Ride the World – Indoor Cycling */}
      {!isMapReady && (
        <div className="absolute inset-0 z-[10000] flex flex-col items-center justify-center bg-slate-900" aria-hidden="true">
          <img src="/bike_conti_128.png" alt="Ride the World – Indoor Cycling" className="w-48 h-48 object-contain mb-5" />
          <p className="text-slate-400 text-2xl font-semibold" style={{ fontSize: '1.425rem' }}>Ride the World – Indoor Cycling</p>
          <p className="absolute bottom-2 left-0 right-0 text-[16px] text-slate-500 text-center pb-2">
            © 2026 LiveOnSoft
          </p>
        </div>
      )}
      {googleMapsBootstrapError && (
        <div
          className="fixed left-0 right-0 z-[9998] mx-2 rounded-xl px-3 py-2.5 bg-amber-950/95 text-amber-50 text-[12px] font-medium leading-snug shadow-xl flex items-start gap-2 border border-amber-800/60"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
          role="alert"
        >
          <span className="flex-1 min-w-0">{googleMapsBootstrapError}</span>
          <button
            type="button"
            className="shrink-0 text-amber-200 underline text-[11px] px-1"
            onClick={() => setGoogleMapsBootstrapError(null)}
          >
            닫기
          </button>
        </div>
      )}
      {/* 인트로 종료 후 3초간 표시: Please click 2 points on the road. (높이 60%→72%, 20% 증가) */}
      {/* {showClickTwoPointsHint && (
        <div className="absolute inset-0 z-[16] flex items-center justify-center pointer-events-none">
          <div className="bg-white/50 border border-slate-200 px-5 py-2 rounded-2xl shadow-xl animate-in fade-in duration-300 origin-center" style={{ transform: 'scaleY(1.0)' }}>
            <p className="font-normal text-base text-center text-blue-600">Please click 2 points on the road.</p>
          </div>
        </div>
      )} */}
      {/* {showClickTwoPointsHint && (
        <div className="absolute inset-0 z-[16] flex items-center justify-center pointer-events-none">
          <div className="bg-white/80 border border-slate-300 px-4 py-2 rounded-xl shadow-md animate-in fade-in duration-300">
            <p className="text-sm font-medium text-blue-600 text-center">
              Please click 2 points on the road
            </p>
          </div>
        </div>
      )} */}
      {showClickTwoPointsHint && (
        <div className="absolute inset-0 z-[16] flex items-center justify-center pointer-events-none">
          <div className="bg-white/85 border border-slate-300 px-5 py-1.5 rounded-full shadow-md backdrop-blur-sm animate-in fade-in duration-300">
            <p className="text-sm font-semibold text-blue-600 text-center whitespace-nowrap">
              Please click 2 points on the road
            </p>
          </div>
        </div>
      )}      
      {/* Go 버튼 클릭 시 4초 카운트다운 오버레이 */}
      {countdown !== null && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
          <div className="text-white text-[120px] font-black tracking-tighter drop-shadow-2xl animate-pulse">
            {countdown === 'start' ? 'Start!' : countdown}
          </div>
        </div>
      )}

      <SensorsModal
        open={sensorsModalOpen}
        onClose={() => setSensorsModalOpen(false)}
        prefs={sensorPrefs}
        onChangePrefs={(next) => {
          setSensorPrefs(next);
          saveIndoorSensorPrefs(next);
        }}
      />

      <BikeProfileModal
        open={bikeProfileModalOpen}
        onSave={(profile: Exclude<BikeProfile, 'unset'>, circMm: number) => {
          const next = {
            ...sensorPrefsRef.current,
            bikeProfile: profile,
            wheelCircumferenceMm: circMm,
          };
          sensorPrefsRef.current = next;
          setSensorPrefs(next);
          saveIndoorSensorPrefs(next);
          setBikeProfileModalOpen(false);
        }}
        onDismiss={() => {
          bikeProfilePromptSuppressedRef.current = true;
          setBikeProfileModalOpen(false);
        }}
      />

      {androidExitHintVisible && Capacitor.getPlatform() === 'android' && (
        <div
          className="absolute left-1/2 z-[2100] -translate-x-1/2 pointer-events-none px-4 w-full max-w-sm flex justify-center"
          style={{ bottom: SAFE_BOTTOM_EXIT_TOAST }}
        >
          <div className="bg-slate-900/90 text-white text-[13px] font-medium px-4 py-2.5 rounded-2xl shadow-lg text-center">
            한 번 더 누르면 앱이 종료됩니다
          </div>
        </div>
      )}

      {/* Rewarded Ad Offer (FIRST/SECOND) */}
      {rewardOfferModalStage && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-2xl p-4 w-[92%] max-w-[420px]">
            <div className="text-slate-900 font-extrabold text-[16px]">
              {rewardOfferModalStage === 'FIRST' ? 'Rewarded Ad Opportunity' : 'Extend Your Ride'}
            </div>
            <div className="text-slate-700 text-[13px] mt-2 leading-snug">
              {rewardOfferModalStage === 'FIRST' ? (
                <>
                  Your route is <span className="font-bold">{rewardOfferTargetKm.toFixed(1)} km</span>.
                  Watch a rewarded ad to extend your ride from <span className="font-bold">5 km</span> up to{' '}
                  <span className="font-bold">{rewardOfferTargetKm.toFixed(1)} km</span>.
                </>
              ) : (
                <>
                  Want to extend your ride? Watch a rewarded ad to ride up to{' '}
                  <span className="font-bold">{rewardOfferTargetKm.toFixed(1)} km</span>.
                </>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={rewardOfferModalStage === 'FIRST' ? handleRewardWatchFirst : handleRewardWatchSecond}
                disabled={rewardAdInFlightRef.current}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[13px] rounded-xl py-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {rewardAdInFlightRef.current ? 'Loading...' : 'Watch Ad'}
              </button>

              {rewardOfferModalStage === 'FIRST' ? (
                <button
                  type="button"
                  onClick={handleRewardStartWithDefault}
                  disabled={rewardAdInFlightRef.current}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-900 font-bold text-[13px] rounded-xl py-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Start with 5 km
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRewardDeclineSecond}
                  disabled={rewardAdInFlightRef.current}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-900 font-bold text-[13px] rounded-xl py-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  No thanks
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Max ride message */}
      {maxRideLimitMessage && (
        <div className="absolute inset-0 z-[2001] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-2xl p-4 w-[92%] max-w-[420px]">
            <div className="text-slate-900 font-extrabold text-[16px]">Unavailable</div>
            <div className="text-slate-700 text-[13px] mt-2 leading-snug">{maxRideLimitMessage}</div>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                type="button"
                onClick={() => { setMaxRideLimitMessage(null); }}
                className="bg-blue-700 hover:bg-blue-800 text-white font-bold text-[13px] rounded-xl px-4 py-2"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ride limit reached message */}
      {rideLimitMessage && (
        <div className="absolute inset-0 z-[2002] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-2xl p-4 w-[92%] max-w-[420px]">
            <div className="text-slate-900 font-extrabold text-[16px]">Ride Ended</div>
            <div className="text-slate-700 text-[13px] mt-2 leading-snug">{rideLimitMessage}</div>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                type="button"
                onClick={() => { setRideLimitMessage(null); }}
                className="bg-blue-700 hover:bg-blue-800 text-white font-bold text-[13px] rounded-xl px-4 py-2"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Street View Container — 주행 시 항상 표시(기본 기능). 전환 유지. */}
      <div
        ref={svContainerRef}
        className={`bg-black transition-all duration-500 ease-in-out overflow-hidden ${isSvActive ? (isSvFullScreen ? 'absolute top-0 left-0 right-0 z-40 opacity-100' : 'absolute top-0 left-0 right-0 h-[50%] z-20 opacity-100 border-b-2 border-slate-700') : 'absolute top-0 left-0 w-full h-0 opacity-0 pointer-events-none z-0'}`}
        style={{
          bottom: (isSvActive && isSvFullScreen)
            ? 0
            : undefined,
        }}
      >
        <div ref={svRef1} className={`absolute inset-0 transition-opacity duration-300 ${visiblePanoIdx === 0 ? 'z-20 opacity-100' : 'z-10'}`} />
        {!USE_CONTINUOUS_SV_DRIVE_THROUGH && (
          <div ref={svRef2} className={`absolute inset-0 transition-opacity duration-300 ${visiblePanoIdx === 1 ? 'z-20 opacity-100' : 'z-10'}`} />
        )}
      </div>

      {loading && (
        <div className="absolute left-1/2 -translate-x-1/2 z-[75] pointer-events-none px-2 text-center" style={{ top: SAFE_TOP_1REM }}>
          <span className="route-search-blink text-white font-bold text-sm text-glow-black">Searching for route...</span>
        </div>
      )}
      {appPhase === 'PREPARING' && preparingProgress && (
        <div className="absolute left-1/2 -translate-x-1/2 z-[75] pointer-events-none px-2 text-center" style={{ top: SAFE_TOP_1REM }}>
          <span className="text-white font-bold text-sm text-glow-black">Preparing Street View... ({preparingProgress.k}/{preparingProgress.n})</span>
        </div>
      )}
      {isSvActive && showSvWarning && (
        <div
          className={`absolute z-[45] flex items-center justify-start pointer-events-none ${isSvFullScreen ? 'bottom-32' : 'top-[42%]'}`}
          style={{ left: SAFE_LEFT_1REM }}
        >
          <div className="bg-black/80 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-xl flex items-center gap-2 shadow-xl animate-in fade-in zoom-in duration-300">
            <ShieldAlert size={18} className="text-amber-500 animate-pulse" />
            <span className="text-white font-bold text-xs">No Street View available for this section.</span>
          </div>
        </div>
      )}
      {isSvActive && isUserPano && (
        <div
          className={`absolute z-[45] flex items-center justify-start pointer-events-none ${isSvFullScreen ? 'bottom-32' : 'top-[42%]'}`}
          style={{ left: SAFE_LEFT_1REM }}
        >
          <div className="bg-slate-700/90 backdrop-blur-xl border border-white/10 px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-xl">
            <span className="text-slate-200 font-medium text-[10px]">사용자 제작 이미지</span>
          </div>
        </div>
      )}
      {/* Elevation: 평지 폴백 토스트 (5초 자동 사라짐) */}
      {elevationStatus?.kind === 'flat' && (
        <div
          className="absolute z-[60] flex items-center justify-start pointer-events-none"
          style={{ left: SAFE_LEFT_1REM, top: '42%' }}
        >
          <div className="bg-amber-600/90 backdrop-blur-xl border border-white/20 px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-xl animate-in fade-in zoom-in duration-300">
            <ShieldAlert size={14} className="text-white" />
            <span className="text-white font-bold text-[11px]">표고 정보를 불러오지 못해 평지로 진행합니다.</span>
          </div>
        </div>
      )}
      {/* Elevation: 디버그 배지 (어떤 공급자가 응답했는지) — 작게 우상단 보조 위치. */}
      {elevationStatus?.kind === 'ok' && elevationStatus.provider && (
        <div
          className="absolute z-[55] pointer-events-none"
          style={{ right: SAFE_RIGHT_1REM, bottom: '6.5rem' }}
        >
          <div className="bg-black/55 backdrop-blur-md border border-white/10 px-2 py-0.5 rounded-md">
            <span className="text-white/85 text-[10px] font-mono">elev: {elevationStatus.provider === 'open-elevation' ? 'open' : 'topo'}</span>
          </div>
        </div>
      )}
      {/* 맵: 불투명 배경(bg-slate-900)으로 거리뷰 비침 방지, 전환 후 invalidateSize. */}
      <div
        ref={mapRef}
        className={`duration-500 ease-in-out bg-slate-900 ${!isSvActive ? 'absolute top-0 left-0 right-0 z-10' : isSvFullScreen ? "absolute w-36 h-36 z-[500] rounded-3xl border-4 border-white shadow-2xl overflow-hidden" : "absolute left-0 right-0 h-[50%] z-[25] overflow-hidden"} ${!mapRevealed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{
          transitionProperty: (isSvActive && isSvFullScreen) ? 'top, left, border-radius, border-width' : 'top, left, right, bottom, width, height, border-radius',
          width: (isSvActive && isSvFullScreen) ? 144 : undefined,
          height: (isSvActive && isSvFullScreen) ? 144 : undefined,
          bottom: !isSvFullScreen ? 0 : undefined,
          ...(isSvActive && isSvFullScreen
            ? {
                top: SAFE_TOP_4_25REM,
                left: SAFE_LEFT_1REM,
              }
            : {}),
        }}
        onTransitionEnd={() => {
          const map = googleMapRef.current;
          triggerMapResize(map);
        }}
      />
      {mapRevealed && (
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-0 z-[1000] text-[11px] text-slate-600 hover:underline bg-white/55 mr-[5px] pointer-events-auto"
          style={{ bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}
        >
          © OpenStreetMap contributors
        </a>
      )}
      {simulation.isActive && coachData && coachingMentVisible && (
        <div className="absolute left-1/2 -translate-x-1/2 z-[9999] pointer-events-none px-2 text-center" style={{ top: SAFE_TOP_1REM }}>
          <span className="text-white font-bold text-sm text-glow-black">{coachData.tip}</span>
        </div>
      )}



      {/* Map Style Button - Moved Left (80% size) */}
      <div
        className="fixed z-[1000] pointer-events-auto"
        style={{
          right: 'calc(env(safe-area-inset-right, 0px) + 4rem)',
          top: SAFE_TOP_1REM,
        }}
      >
        <button
          type="button"
          onPointerDown={stopPointerPropagation}
          onTouchStart={stopPointerPropagation}
          onTouchEnd={(e) => activateFromTouchEnd(e, handleToggleMapType)}
          onClick={handleToggleMapType}
          title="Change Map Style"
          className={`w-[2.4rem] h-[2.4rem] rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center touch-manipulation ${mapType === 'hybrid' ? 'bg-slate-800 text-white' : 'bg-white text-slate-400'}`}
        >
          <Layers size={19} className="pointer-events-none" />
        </button>
      </div>

      {/* Main Control Group - Shifted Up (80% size) */}
      <div
        className="fixed z-[1000] flex flex-col gap-1.5 pointer-events-auto"
        style={{
          right: 'calc(env(safe-area-inset-right, 0px) + 1rem)',
          top: SAFE_TOP_1REM,
        }}
      >
        <button
          type="button"
          onPointerDown={stopPointerPropagation}
          onTouchStart={stopPointerPropagation}
          onTouchEnd={(e) => activateFromTouchEnd(e, () => setShowCoverage((v) => !v))}
          onClick={() => setShowCoverage(!showCoverage)}
          title={showCoverage ? "Hide Street View Coverage" : "Show Street View Coverage"}
          className={`w-[2.4rem] h-[2.4rem] rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center touch-manipulation ${showCoverage ? 'bg-blue-600 text-white' : 'bg-white text-slate-400'}`}
        >
          <RouteIcon size={19} aria-label={showCoverage ? "Hide Street View Coverage" : "Show Street View Coverage"} className="pointer-events-none" />
        </button>
        <button onClick={handleToggleStreetView} title={isSvActive ? "Hide Street View" : "Show Street View"} className={`w-[2.4rem] h-[2.4rem] rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center ${isSvActive ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-400'}`}>
          <img src={STREETVIEW_ICON} alt="Street View" className="w-[1.2rem] h-[1.2rem] object-contain" />
        </button>
        {isSvActive && (
          <button onClick={() => setIsSvFullScreen(!isSvFullScreen)} title={isSvFullScreen ? "Minimize View" : "Maximize View"} className={`w-[2.4rem] h-[2.4rem] rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center bg-white text-slate-900`}>
            {isSvFullScreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
          </button>
        )}
      </div>

      {/* Current Speed / Avg Speed / Current RPM - top-right overlay */}
      <div
        className="fixed z-[1000] flex flex-col items-end leading-none select-none"
        style={{
          right: 'calc(env(safe-area-inset-right, 0px) + 1rem + 2.4rem + 0.5rem)',
          top: SAFE_TOP_SPEED_PANEL,
          pointerEvents: 'none',
        }}
      >
        {/* Feel 트림: 공간은 항상 유지(invisible)해 속도·케이던스 등 아래 줄이 센서 On/Off로 움직이지 않게 함 */}
        <div
          className={`mb-1 flex items-center gap-1 bg-black/50 rounded-full px-1.5 py-0.5 border border-white/20 ${
            sensorPrefs.sensorDriveEnabled ? '' : 'invisible pointer-events-none'
          }`}
          style={{ pointerEvents: sensorPrefs.sensorDriveEnabled ? 'auto' : 'none' }}
          title={sensorPrefs.sensorDriveEnabled ? 'Feel adjust: subtle speed multiplier' : undefined}
          aria-hidden={!sensorPrefs.sensorDriveEnabled}
        >
          <button
            type="button"
            onClick={adjustFeelKDown}
            disabled={!sensorPrefs.sensorDriveEnabled || (sensorPrefs.feelK ?? 1) <= FEEL_K_MIN + 1e-6}
            className="w-5 h-5 flex items-center justify-center rounded-full bg-white text-slate-800 text-[12px] font-black leading-none disabled:opacity-40"
            aria-label="Decrease feel"
            tabIndex={sensorPrefs.sensorDriveEnabled ? undefined : -1}
          >
            −
          </button>
          <button
            type="button"
            onClick={resetFeelK}
            disabled={!sensorPrefs.sensorDriveEnabled}
            className="text-[12px] font-black text-white tabular-nums leading-none px-1 [text-shadow:0_0_2px_#000] disabled:opacity-40"
            aria-label="Reset feel"
            title="Long-press/tap to reset"
            tabIndex={sensorPrefs.sensorDriveEnabled ? undefined : -1}
          >
            {Math.round((sensorPrefs.feelK ?? 1) * 100)}%
          </button>
          <button
            type="button"
            onClick={adjustFeelKUp}
            disabled={!sensorPrefs.sensorDriveEnabled || (sensorPrefs.feelK ?? 1) >= FEEL_K_MAX - 1e-6}
            className="w-5 h-5 flex items-center justify-center rounded-full bg-white text-slate-800 text-[12px] font-black leading-none disabled:opacity-40"
            aria-label="Increase feel"
            tabIndex={sensorPrefs.sensorDriveEnabled ? undefined : -1}
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-1" style={{ pointerEvents: 'auto' }} title="Current speed">
          {/* 아이콘+ON/OFF 한 버튼: 연결 시 ON·녹색, 미연결 시 OFF·(모드·상태에 따라 흰색/녹색 점멸 동일) */}
          <button
            type="button"
            onClick={() => void toggleSensorQuickMode()}
            title={
              !sensorPrefs.sensorDriveEnabled
                ? '센서 켜기 (스캔·연결·감지)'
                : sensorBleBusyHud
                  ? '스캔·연결 중… 탭하면 센서 끄기'
                  : sensorHubConnected
                    ? '센서 끄기 (스캔·연결 중지)'
                    : '연결된 센서 없음 · 탭하면 센서 끄기'
            }
            aria-label={
              sensorPrefs.sensorDriveEnabled
                ? `Bluetooth sensors, ${sensorHubConnected ? 'connected' : 'not connected'}, tap to turn off`
                : 'Turn on Bluetooth sensors'
            }
            className={`shrink-0 flex items-center gap-0.5 rounded-full border border-emerald-400/90 px-0.5 py-0.5 -translate-x-[4px] active:scale-95 touch-manipulation [text-shadow:0_0_2px_#000,0_0_4px_rgba(0,0,0,0.9)] drop-shadow-[0_0_2px_rgba(0,0,0,1)] drop-shadow-[0_0_6px_rgba(0,0,0,0.85)] ${
              !sensorPrefs.sensorDriveEnabled
                ? 'text-white'
                : sensorBleBusyHud
                  ? 'text-emerald-400 animate-sensor-led'
                  : sensorHubConnected
                    ? 'text-emerald-400'
                    : 'text-white'
            }`}
          >
            <Bluetooth
              size={10}
              strokeWidth={2.25}
              className="pointer-events-none shrink-0 drop-shadow-[0_0_2px_rgba(0,0,0,1)] drop-shadow-[0_0_6px_rgba(0,0,0,0.85)]"
              aria-hidden
            />
            <span className="text-[10px] font-black leading-none tracking-tight pointer-events-none select-none tabular-nums">
              {sensorHubConnected ? 'ON' : 'OFF'}
            </span>
          </button>
          <span className="text-[14px] font-black text-sky-400 tabular-nums leading-none [text-shadow:0_0_2px_#000,0_0_4px_#000,1px_0_0_#000,-1px_0_0_#000,0_1px_0_#000,0_-1px_0_#000]">
            {effectiveSpeedKmH < 0.3 ? '0.0' : effectiveSpeedKmH.toFixed(1)} km/h
          </span>
        </div>
        <span
          className="mt-0.5 text-[14px] font-black text-sky-400 tabular-nums leading-none [text-shadow:0_0_2px_#000,0_0_4px_#000,1px_0_0_#000,-1px_0_0_#000,0_1px_0_#000,0_-1px_0_#000]"
          title="Average speed"
        >
          {(elapsedTime > 0 ? (coveredDistance / 1000) / (elapsedTime / 3600) : 0).toFixed(1)} km/h
        </span>
        <span
          className="mt-0.5 text-[14px] font-black text-green-400 tabular-nums leading-none [text-shadow:0_0_2px_#000,0_0_4px_#000,1px_0_0_#000,-1px_0_0_#000,0_1px_0_#000,0_-1px_0_#000]"
          title="Current cadence (RPM)"
        >
          {speedSource === 'wheel' && !hasCadenceSignal
            ? '---'
            : `${currentRpm != null && currentRpm >= SENSOR_DISPLAY_ZERO_RPM ? Math.round(currentRpm) : '0'} RPM`}
        </span>
        <span
          className="mt-0.5 text-[14px] font-black text-green-400 tabular-nums leading-none [text-shadow:0_0_2px_#000,0_0_4px_#000,1px_0_0_#000,-1px_0_0_#000,0_1px_0_#000,0_-1px_0_#000]"
          title="Average cadence (RPM)"
        >
          {averageRpm >= SENSOR_DISPLAY_ZERO_RPM ? Math.round(averageRpm) : '0'} RPM
        </span>
        {route && (
          <>
            <span
              className="mt-1 text-[13px] font-black text-blue-300 tabular-nums leading-none [text-shadow:0_0_2px_#000,0_0_4px_#000,1px_0_0_#000,-1px_0_0_#000,0_1px_0_#000,0_-1px_0_#000]"
              title="Covered / total distance"
            >
              {(coveredDistance / 1000).toFixed(1)}/{(parseFloat(route.distance) || 0).toFixed(1)}km
            </span>
            <span
              className={`mt-0.5 text-[13px] font-black text-blue-300 tabular-nums leading-none [text-shadow:0_0_2px_#000,0_0_4px_#000,1px_0_0_#000,-1px_0_0_#000,0_1px_0_#000,0_-1px_0_#000] ${simulation.isActive ? 'animate-pulse' : ''}`}
              title="Elapsed time"
            >
              {formatTime(elapsedTime)}
            </span>
          </>
        )}
      </div>

      <div
        className={`fixed z-[1000] flex flex-col items-start transition-all duration-300 ease-out bg-white/95 backdrop-blur-md shadow-2xl pointer-events-auto ${searchExpanded ? 'overflow-visible' : 'overflow-hidden'} ${searchExpanded ? 'w-[255px] max-w-[calc(100vw-32px)] rounded-2xl border border-slate-200' : 'w-[2.4rem] h-[2.4rem] rounded-full border-2 border-blue-600 group'}`}
        style={{
          left: 'calc(env(safe-area-inset-left, 0px) + 1rem + 2.4rem + 6px)',
          top: SAFE_TOP_1REM,
        }}
      >
        <div ref={searchBarContainerRef} className="relative w-full flex flex-col shrink-0">
          <div className={`flex items-center w-full pr-5 shrink-0 ${searchExpanded ? 'h-12' : 'h-[2.4rem]'}`}>
            <button
              type="button"
              onPointerDown={stopPointerPropagation}
              onTouchStart={stopPointerPropagation}
              onTouchEnd={(e) => activateFromTouchEnd(e, () => setSearchExpanded((v) => !v))}
              onClick={() => setSearchExpanded(!searchExpanded)}
              title="Search Places"
              className="flex-shrink-0 w-[2.4rem] h-[2.4rem] flex items-center justify-center text-slate-500 hover:text-blue-600 touch-manipulation"
            >
              {searchExpanded ? <ChevronLeft size={16} className="pointer-events-none" /> : <Search size={16} className="pointer-events-none" />}
            </button>
            <input
              type="text"
              placeholder="장소 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => searchExpanded && placeSearchSuggestions.length > 0 && setShowPlaceSearchSuggestions(true)}
              onBlur={() => {
                if (closePlaceSuggestRef.current) clearTimeout(closePlaceSuggestRef.current);
                closePlaceSuggestRef.current = window.setTimeout(() => setShowPlaceSearchSuggestions(false), 180);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (placeSearchSuggestions.length === 0) return;
                  setShowPlaceSearchSuggestions(true);
                  setPlaceSearchHighlightIndex((i) => (i < placeSearchSuggestions.length - 1 ? i + 1 : i));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setPlaceSearchHighlightIndex((i) => (i <= 0 ? -1 : i - 1));
                  return;
                }
                if (e.key === 'Enter') {
                  if (placeSearchHighlightIndex >= 0 && placeSearchSuggestions[placeSearchHighlightIndex]) {
                    e.preventDefault();
                    handleSelectPlaceSearchSuggestion(placeSearchSuggestions[placeSearchHighlightIndex]);
                    return;
                  }
                  handlePlaceSearch();
                  return;
                }
                if (e.key === 'Escape') {
                  setShowPlaceSearchSuggestions(false);
                  setPlaceSearchHighlightIndex(-1);
                }
              }}
              className="flex-1 bg-transparent border-none outline-none text-slate-900 font-bold text-[12px] pr-2 min-w-0"
            />
            {searchTerm && (
              <button type="button" onClick={handleClearSearch} title="Clear Search" className="flex-shrink-0 w-8 h-full flex items-center justify-center text-slate-400 hover:text-red-500 touch-manipulation">
                <X size={14} />
              </button>
            )}
          </div>
          {searchExpanded && showPlaceSearchSuggestions && placeSearchSuggestions.length > 0 && (
            <ul
              className="absolute left-1/2 top-full z-[1100] mt-0.5 w-[150%] -translate-x-1/2 py-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto"
              role="listbox"
              aria-label="장소 추천"
              aria-activedescendant={placeSearchHighlightIndex >= 0 ? `place-search-suggestion-${placeSearchHighlightIndex}` : undefined}
            >
              {placeSearchSuggestions.map((item, idx) => (
                <li key={`${item.lat},${item.lng},${idx}`} id={`place-search-suggestion-${idx}`} role="option" aria-selected={placeSearchHighlightIndex === idx}>
                  <button
                    type="button"
                    ref={idx === placeSearchHighlightIndex ? (el) => { el?.scrollIntoView({ block: 'nearest' }); } : undefined}
                    className={`w-full text-left px-2 py-2 text-[11px] leading-snug flex items-start gap-2 ${placeSearchHighlightIndex === idx ? 'bg-emerald-100 text-emerald-900' : 'text-slate-700 hover:bg-slate-50'}`}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      handleSelectPlaceSearchSuggestion(item);
                    }}
                    onMouseEnter={() => setPlaceSearchHighlightIndex(idx)}
                  >
                    <MapPin size={12} className="shrink-0 mt-0.5 text-slate-400" aria-hidden />
                    <span className="truncate">{item.display_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {searchExpanded && recentPlaceSearches.length > 0 && (
          <div className="w-full flex flex-col px-2 pb-2 gap-1 border-t border-slate-100">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider px-1 mt-1">Recent</span>
            {recentPlaceSearches.map((term, idx) => (
              <button key={idx} onClick={() => handlePlaceHistoryClick(term)} className="text-left w-full truncate text-[11px] text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded px-1 py-1 transition-colors flex items-center gap-2"><History size={10} className="text-slate-400" />{term}</button>
            ))}
          </div>
        )}
      </div>
      <div
        className={`absolute z-[1000] flex items-end transition-all duration-300 ease-out overflow-hidden pointer-events-auto ${routeInputExpanded ? (historyExpanded ? (routeSettingsPanelExpanded ? 'w-[598px] min-w-[598px] max-w-[598px]' : 'w-[370px] min-w-[370px] max-w-[370px]') : (routeSettingsPanelExpanded ? 'w-[282px] min-w-[282px] max-w-[282px]' : 'w-[80px] min-w-[80px] max-w-[80px]')) : 'w-[2.4rem] h-[2.4rem] border-2 border-blue-600 rounded-full group'}`}
        style={{ left: SAFE_LEFT_1REM, bottom: SAFE_BOTTOM_25 }}
      >
        <div className={`bg-white/95 backdrop-blur-md rounded-[1.5rem] shadow-2xl flex flex-row w-full border border-slate-200 px-1 py-0.5 relative items-center ${routeInputExpanded ? '' : 'h-full'}`}>
          <div className={`flex flex-col items-center shrink-0 z-10 ${routeInputExpanded ? 'w-4 self-stretch justify-start' : 'w-full h-full justify-center'}`}>
            <button onClick={() => setRouteInputExpanded(!routeInputExpanded)} title="Route Settings" className={`flex items-center justify-center text-slate-400 hover:text-slate-600 shrink-0 mt-[6px] ${routeInputExpanded ? 'w-[1rem] h-[1rem]' : 'w-full h-full'}`}>{routeInputExpanded ? <ChevronsLeft size={14} /> : <Waypoints size={16} className="text-blue-600" />}</button>
            {routeInputExpanded && (
              <div className="flex-1 flex items-center justify-center min-h-0">
              <button onClick={() => { if (!historyExpanded && routeSettingsPanelExpanded) { setRouteInputExpanded(false); } else { setRouteSettingsPanelExpanded(!routeSettingsPanelExpanded); } }} title={routeSettingsPanelExpanded ? "Collapse Route Details" : "Expand Route Details"} className="w-4 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 shrink-0 mt-[-15px]" aria-label={routeSettingsPanelExpanded ? "Collapse Route Details" : "Expand Route Details"}>
                {routeSettingsPanelExpanded ? <ChevronLeft size={14} className="opacity-80" /> : <ChevronRight size={14} className="opacity-80" />}
              </button>
              </div>
            )}
            {routeInputExpanded && !routeSettingsPanelExpanded && (
              <button
                onClick={() => setHistoryExpanded(!historyExpanded)}
                title={historyExpanded ? "Collapse My Routes" : "Expand My Routes"}
                className="hidden w-4 h-8 flex items-center justify-center text-slate-300 hover:text-slate-500 rounded hover:bg-slate-100 transition-colors shrink-0"
                aria-label={historyExpanded ? "Collapse My Routes" : "Expand My Routes"}
              >
                {historyExpanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              </button>
            )}
          </div>
          {routeInputExpanded && (
            <div className="flex flex-row w-full pl-0.5 gap-1 items-center">
              {routeSettingsPanelExpanded && (
              <div ref={routeInputContainerRef} className="flex-none w-[232px] flex flex-col justify-center gap-1">
                <div className="relative flex flex-col gap-1">
                  <div className="relative">
                    <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2 h-7 bg-white shadow-sm w-full">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                      <input
                        className="flex-1 w-full text-xs outline-none text-slate-700 font-medium placeholder:text-slate-400 bg-transparent truncate min-w-0"
                        placeholder="Start"
                        value={origin}
                        onChange={(e) => { setOrigin(e.target.value); originLocationRef.current = null; }}
                        onFocus={() => originSuggestions.length > 0 && setShowOriginSuggestions(true)}
                        onBlur={() => {
                          if (closeOriginSuggestRef.current) clearTimeout(closeOriginSuggestRef.current);
                          closeOriginSuggestRef.current = window.setTimeout(() => setShowOriginSuggestions(false), 180);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (originSuggestions.length === 0) return;
                            setShowOriginSuggestions(true);
                            setOriginHighlightIndex((i) => (i < originSuggestions.length - 1 ? i + 1 : i));
                            return;
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setOriginHighlightIndex((i) => (i <= 0 ? -1 : i - 1));
                            return;
                          }
                          if (e.key === 'Enter') {
                            if (originHighlightIndex >= 0 && originSuggestions[originHighlightIndex]) {
                              e.preventDefault();
                              handleSelectOriginSuggestion(originSuggestions[originHighlightIndex]);
                            }
                            return;
                          }
                          if (e.key === 'Escape') {
                            setShowOriginSuggestions(false);
                            setOriginHighlightIndex(-1);
                          }
                        }}
                      />
                      <button onClick={handleRemoveStart} title="Remove Start" className="text-slate-400 hover:text-red-500 shrink-0">
                        <X size={10} />
                      </button>
                    </div>
                    {showOriginSuggestions && originSuggestions.length > 0 && (
                      <ul className="absolute top-full left-0 w-[195%] mt-0.5 py-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[70] max-h-40 overflow-y-auto" role="listbox" aria-activedescendant={originHighlightIndex >= 0 ? `origin-suggestion-${originHighlightIndex}` : undefined}>
                        {originSuggestions.map((item, idx) => (
                          <li key={idx} id={`origin-suggestion-${idx}`} role="option" aria-selected={originHighlightIndex === idx}>
                            <button ref={idx === originHighlightIndex ? (el) => { originSuggestionItemRef.current = el; el?.scrollIntoView({ block: 'nearest' }); } : undefined} type="button" className={`w-full text-left px-2 py-1.5 text-[11px] truncate ${originHighlightIndex === idx ? 'bg-blue-100 text-blue-900' : 'text-slate-700 hover:bg-blue-50'}`} onMouseDown={(e) => { e.preventDefault(); handleSelectOriginSuggestion(item); }} onMouseEnter={() => setOriginHighlightIndex(idx)}>
                              {item.display_name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {/* Waypoints Render */}
                  {waypoints.length > 0 && (
                    <div className="flex flex-col gap-1 px-1">
                      {waypoints.map((wp, idx) => (
                        <div key={idx} className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 h-6 bg-slate-50 shadow-inner w-full">
                          <div className="w-3 h-3 rounded-full bg-amber-500 shrink-0 flex items-center justify-center text-[7px] text-white font-black">{idx + 1}</div>
                          <span className="flex-1 text-[9px] text-slate-500 font-bold truncate tracking-tighter">{wp.name}</span>
                          <button onClick={() => handleRemoveWaypoint(idx)} title="Remove Waypoint" className="text-slate-400 hover:text-red-500 shrink-0">
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2 h-7 bg-white shadow-sm w-full">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" />
                      <input
                        className="flex-1 w-full text-xs outline-none text-slate-700 font-medium placeholder:text-slate-400 bg-transparent truncate min-w-0"
                        placeholder="End"
                        value={destination}
                        onChange={(e) => { setDestination(e.target.value); destLocationRef.current = null; }}
                        onFocus={() => destinationSuggestions.length > 0 && setShowDestinationSuggestions(true)}
                        onBlur={() => {
                          if (closeDestSuggestRef.current) clearTimeout(closeDestSuggestRef.current);
                          closeDestSuggestRef.current = window.setTimeout(() => setShowDestinationSuggestions(false), 180);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (destinationSuggestions.length === 0) return;
                            setShowDestinationSuggestions(true);
                            setDestinationHighlightIndex((i) => (i < destinationSuggestions.length - 1 ? i + 1 : i));
                            return;
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setDestinationHighlightIndex((i) => (i <= 0 ? -1 : i - 1));
                            return;
                          }
                          if (e.key === 'Enter') {
                            if (destinationHighlightIndex >= 0 && destinationSuggestions[destinationHighlightIndex]) {
                              e.preventDefault();
                              handleSelectDestinationSuggestion(destinationSuggestions[destinationHighlightIndex]);
                            }
                            return;
                          }
                          if (e.key === 'Escape') {
                            setShowDestinationSuggestions(false);
                            setDestinationHighlightIndex(-1);
                          }
                        }}
                      />
                      <button onClick={handleRemoveEnd} title="Remove End" className="text-slate-400 hover:text-red-500 shrink-0">
                        <X size={10} />
                      </button>
                    </div>
                    {showDestinationSuggestions && destinationSuggestions.length > 0 && (
                      <ul className="absolute top-full left-0 w-[195%] mt-0.5 py-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[70] max-h-40 overflow-y-auto" role="listbox" aria-activedescendant={destinationHighlightIndex >= 0 ? `dest-suggestion-${destinationHighlightIndex}` : undefined}>
                        {destinationSuggestions.map((item, idx) => (
                          <li key={idx} id={`dest-suggestion-${idx}`} role="option" aria-selected={destinationHighlightIndex === idx}>
                            <button ref={idx === destinationHighlightIndex ? (el) => { destSuggestionItemRef.current = el; el?.scrollIntoView({ block: 'nearest' }); } : undefined} type="button" className={`w-full text-left px-2 py-1.5 text-[11px] truncate ${destinationHighlightIndex === idx ? 'bg-red-100 text-red-900' : 'text-slate-700 hover:bg-red-50'}`} onMouseDown={(e) => { e.preventDefault(); handleSelectDestinationSuggestion(item); }} onMouseEnter={() => setDestinationHighlightIndex(idx)}>
                              {item.display_name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 w-full px-0.5">
                  <button
                    type="button"
                    onClick={() => setSensorsModalOpen(true)}
                    title="Sensors & speed"
                    aria-label="Sensors & speed"
                    className="relative shrink-0 h-7 min-w-[34px] px-2 flex items-center justify-center gap-1 rounded-md border border-blue-300 bg-white shadow-sm text-blue-600 hover:bg-slate-50 active:scale-95 transition-transform"
                  >
                    <Gauge size={16} strokeWidth={2.2} />
                    <span className="text-[11px] font-bold leading-none">Sensor</span>
                    <span
                      className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-white ${sensorHubConnected ? 'bg-emerald-500 animate-sensor-led' : 'bg-slate-300'}`}
                      aria-hidden
                    />
                  </button>
                  <button type="button" onClick={() => setSpeedKmH((prev) => Math.max(10, prev - 1))} title="Decrease speed" className="w-[19.2px] h-[19.2px] flex items-center justify-center rounded bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 active:scale-95 transition-transform shrink-0 disabled:opacity-50" disabled={speedKmH <= 10} aria-label="Decrease speed"><Minus size={10} /></button>
                  <input
                    type="number"
                    min={10}
                    max={70}
                    value={speedKmH}
                    onChange={(e) => setSpeedKmH(Number(e.target.value) || 0)}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 10;
                      setSpeedKmH(Math.min(70, Math.max(10, v)));
                    }}
                    className="speed-input-no-spinner w-[29px] h-6 text-[11px] font-bold text-center bg-white border border-slate-300 rounded-md text-slate-700 focus:outline-none focus:border-blue-500 px-1 shrink-0"
                    aria-label="Speed"
                  />
                  <button type="button" onClick={() => setSpeedKmH((prev) => Math.min(70, prev + 1))} title="Increase speed" className="w-[19.2px] h-[19.2px] flex items-center justify-center rounded bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 active:scale-95 transition-transform shrink-0 disabled:opacity-50" disabled={speedKmH >= 70} aria-label="Increase speed"><Plus size={10} /></button>
                  <div className="flex items-center gap-1 ml-auto shrink-0">
                    <button onClick={handleSwapEndpoints} title="Swap Origin & Destination" className="w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-md hover:bg-slate-50 active:scale-95 transition-transform"><ArrowUpDown size={12} className="text-slate-600" /></button>

                    <button onClick={handleToggleFavorite} title={isSaved ? "My Routes" : "Add to Favorites"} className={`w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-md hover:bg-slate-50 active:scale-95 transition-transform ${isSaved ? 'border-amber-200' : ''}`}>
                      <Star size={12} className={isSaved ? "text-amber-400 fill-amber-400" : "text-slate-400"} />
                    </button>

                    <button onClick={clearMapOverlays} title="Delete Route" className="w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-md hover:bg-slate-50 active:scale-95 transition-transform"><Trash2 size={12} className="text-slate-600" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-1 w-full">
                  <div className="flex-1 min-w-0 max-w-[88px] flex items-center justify-center gap-1 bg-slate-100 border border-slate-200 rounded-lg h-7 px-1 overflow-hidden">
                    <span className="text-[10px] font-black text-slate-700 truncate">{route ? route.distance : '0.0 km'}</span>
                    <div className="h-3 w-px bg-slate-300 shrink-0"></div>
                    <span className="text-[10px] font-bold text-slate-500 truncate">{route ? route.duration : '0:00'}</span>
                  </div>
                  <button onClick={() => { setMode(TravelMode.DRIVING); calculateRoute(TravelMode.DRIVING, false); }} title={lockedRouteProfile ? 'Saved route mode is locked' : 'Car'} disabled={loading || !origin || !destination || !!lockedRouteProfile} className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border-2 active:scale-95 transition-transform duration-200 ${modeButtonPulseIndex === 0 ? 'scale-[1.2]' : 'scale-100'} ${mode === TravelMode.DRIVING ? 'bg-red-50 border-red-500 text-red-600' : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'}`}>
                    <Car size={14} />
                  </button>
                  <button onClick={() => { setMode(TravelMode.BICYCLING); calculateRoute(TravelMode.BICYCLING, false); }} title={lockedRouteProfile ? 'Saved route mode is locked' : 'Bike'} disabled={loading || !origin || !destination || !!lockedRouteProfile} className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border-2 active:scale-95 transition-transform duration-200 ${modeButtonPulseIndex === 1 ? 'scale-[1.2]' : 'scale-100'} ${mode === TravelMode.BICYCLING ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'}`}>
                    <Bike size={14} />
                  </button>
                  <button onClick={() => { setMode(TravelMode.WALKING); calculateRoute(TravelMode.WALKING, false); }} title={lockedRouteProfile ? 'Saved route mode is locked' : 'Foot'} disabled={loading || !origin || !destination || !!lockedRouteProfile} className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border-2 active:scale-95 transition-transform duration-200 ${modeButtonPulseIndex === 2 ? 'scale-[1.2]' : 'scale-100'} ${mode === TravelMode.WALKING ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'}`}>
                    <Footprints size={14} />
                  </button>
                  <button onClick={() => { if (route && lastRouteRequestRef.current && inputsMatch(origin, destination, waypoints, mode, lastRouteRequestRef.current)) { countdownDoneRef.current = () => startSimulationOnly(route); setCountdown(3); } else { calculateRoute(mode, true); } }} title="Go" disabled={loading || !origin || !destination || !route} className={`ml-auto w-7 bg-blue-700 text-white rounded-lg h-7 text-xs font-bold shadow-md active:scale-95 transition-transform duration-200 flex items-center justify-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${goButtonPulse ? 'scale-[1.2]' : 'scale-100'}`}>{loading ? <Activity size={14} className="animate-spin" /> : 'Go'}</button>
                </div>
              </div>
              )}

              {routeSettingsPanelExpanded && (
              <div className="w-4 shrink-0 flex items-center justify-center">
                <button
                  onClick={() => setHistoryExpanded(!historyExpanded)}
                  title={historyExpanded ? "Collapse My Routes" : "Expand My Routes"}
                  className="w-4 h-8 flex items-center justify-center rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  {historyExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </button>
              </div>
              )}

              <div className={`border-l border-slate-200 pl-1 pr-2 flex flex-col justify-center gap-0 overflow-hidden transition-all duration-300 ease-in-out ${historyExpanded ? 'flex-1 opacity-100 translate-x-0' : 'flex-none w-0 opacity-0 -translate-x-2 pointer-events-none p-0 border-none'}`}>
                <div className="flex justify-between items-end gap-1 px-1 mb-0.5 border-b border-slate-100 pb-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => setHistoryPanelTab('my_routes')}
                      className={`shrink-0 text-[9px] font-bold tracking-wide pb-0.5 -mb-px border-b-2 transition-colors ${historyPanelTab === 'my_routes' ? 'text-slate-600 border-blue-500' : 'text-slate-400 border-transparent hover:text-slate-500'}`}
                    >
                      My Routes
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryPanelTab('recommended')}
                      className={`shrink-0 text-[9px] font-bold tracking-wide pb-0.5 -mb-px border-b-2 transition-colors ${historyPanelTab === 'recommended' ? 'text-slate-600 border-blue-500' : 'text-slate-400 border-transparent hover:text-slate-500'}`}
                    >
                      Recommanded
                    </button>
                  </div>
                  {historyPanelTab === 'my_routes' && (
                    <span className="text-[9px] text-slate-300 font-medium shrink-0">{favoriteRoutes.length}/5</span>
                  )}
                </div>
                {historyPanelTab === 'my_routes' ? (
                  favoriteRoutes.length > 0 ? favoriteRoutes.map((route) => (
                    <div key={route.id} className="flex items-center justify-between w-full gap-0.5 rounded px-1 py-[1px] transition-colors active:bg-slate-50">
                      <button onClick={() => handleLoadFavorite(route)} title={`${route.origin} → ${route.destination}`} className="text-left flex-1 min-w-0 truncate text-[10px] text-slate-600 leading-none">
                        <span className={`mr-1 text-[8px] font-black ${route.routePayload?.fullGeometry?.length ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {route.routePayload?.fullGeometry?.length ? 'READY' : 'SYNC'}
                        </span>
                        <span className="font-bold mr-1">{route.origin}</span>
                        <span className="text-slate-400">to</span>
                        <span className="font-bold ml-1">{route.destination}</span>
                        {route.waypoints.length > 0 && <span className="ml-1 text-[8px] text-amber-500 font-bold">+{route.waypoints.length}</span>}
                      </button>
                      <button onClick={(e) => handleDeleteFavorite(route.id, e)} title="Delete route" className="shrink-0 w-5 h-5 flex items-center justify-center text-slate-400 active:text-red-500 rounded-full transition-colors" aria-label="Delete route"><X size={11} /></button>
                    </div>
                  )) : (<div className="text-[10px] text-slate-400 text-center italic mt-2">No saved routes</div>)
                ) : (
                  <div className="text-[10px] text-slate-400 text-center italic mt-2 px-1">Recommended routes will load here (Firebase).</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {route && (
        <div
          className={`absolute z-[1000] flex items-end transition-all duration-300 ease-out pointer-events-auto ${elevationExpanded ? 'justify-end w-fit max-w-[90vw] [@media(orientation:landscape)]:max-w-[80vw]' : 'w-[2.4rem] h-[2.4rem] group'}`}
          style={{ right: SAFE_RIGHT_1REM, bottom: SAFE_BOTTOM_25 }}
        >
          {/* <div className="bg-white/95 backdrop-blur-md rounded-[2rem] shadow-2xl flex items-center w-full border border-slate-200 p-1 overflow-hidden"> */}
          <div
            className={`rounded-[2rem] shadow-2xl flex w-full border border-slate-200 overflow-hidden ${elevationExpanded ? 'bg-white/10 backdrop-blur-md items-center py-1 pl-1 pr-0' : 'bg-white h-full items-center justify-center'}`}
          >
            <button
              type="button"
              onClick={() => setElevationExpanded(!elevationExpanded)}
              title="Elevation Profile"
              className={`rounded-full flex items-center justify-center text-slate-500 hover:text-blue-600 ${elevationExpanded ? 'shrink-0 order-last min-w-[2.4rem] min-h-[2.4rem] max-w-[2.4rem] max-h-[2.4rem] w-[2.4rem] h-[2.4rem]' : 'h-full w-full min-h-0 min-w-0'}`}
              aria-label={elevationExpanded ? "Collapse Elevation" : "Elevation Profile"}
            >
              {elevationExpanded ? (
                <ChevronRight
                  size={16}
                  style={{ filter: "drop-shadow(0 1px 1px rgba(255,255,255,0.95)) drop-shadow(0 0 2px rgba(255,255,255,0.9))" }}
                />
              ) : (
                <AreaChartIcon size={16} />
              )}
            </button>
            {elevationExpanded && (
              // <div className="flex-1 min-w-0 pl-3 pr-0 py-1 flex flex-col gap-1.5">
              <div className="flex-1 min-w-0 pl-1 pr-0 py-1 flex flex-col gap-1.5">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setCoachingMentVisible(!coachingMentVisible)} title={coachingMentVisible ? "Hide coaching text" : "Show coaching text"} className={`w-8 h-8 rounded-full flex items-center justify-center shadow transition-all active:scale-95 ${coachingMentVisible ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-400'}`} aria-label={coachingMentVisible ? "Hide coaching text" : "Show coaching text"}>
                    <MessageSquare size={16} />
                  </button>
                  <button type="button" onClick={() => setCoachingOn(!coachingOn)} title={coachingOn ? "Mute coaching voice" : "Unmute coaching voice"} aria-label={coachingOn ? "Mute coaching voice" : "Unmute coaching voice"} className={`w-8 h-8 rounded-full flex items-center justify-center shadow transition-all active:scale-95 ${coachingOn ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-400'}`}>
                    <Mic size={16} />
                  </button>
                  <button type="button" onClick={() => setMusicOn(!musicOn)} title={musicOn ? "Mute music" : "Unmute music"} className={`w-8 h-8 rounded-full flex items-center justify-center shadow transition-all active:scale-95 ${musicOn ? 'bg-amber-100 text-blue-700' : 'bg-slate-200 text-slate-400'}`}>
                    <Music size={16} />
                  </button>
                  <button onClick={restartSimulation} title="Restart Simulation" className="w-8 h-8 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center hover:bg-slate-200"><RotateCcw size={14} /></button>
                  <button onClick={handleToggleSimulation} title={simulation.isActive ? "Pause Simulation" : "Start Simulation"} className={`w-8 h-8 rounded-xl flex items-center justify-center ${simulation.isActive ? 'bg-amber-100 text-amber-600' : 'bg-blue-600 text-white'}`}>{simulation.isActive ? <Pause size={12} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>
                  <button onClick={handleStopSimulation} title="Stop Simulation" className="w-8 h-8 bg-red-100 text-red-600 rounded-xl flex items-center justify-center hover:bg-red-200">
                    <Square size={14} fill="currentColor" />
                  </button>
                </div>
                <div className="h-10 w-full flex items-stretch gap-1">
                  <div className="flex-1 min-w-0 bg-slate-900 rounded-xl pl-1 pt-1 pb-1 pr-0.5 relative overflow-hidden">
                    <ElevationChartView data={route.elevation} currentIndex={simulation.currentIndex} pathLength={route.path.length} />
                    <button
                      type="button"
                      onClick={() => jumpToRouteIndex(Math.max(0, simulation.currentIndex - STEP_OFFSET))}
                      disabled={!route?.path?.length || simulation.currentIndex <= 0}
                      title="Step back"
                      className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-[19.2px] h-[19.2px] flex items-center justify-center rounded-md bg-white/80 text-slate-700 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none transition-all opacity-60 hover:opacity-100"
                      aria-label="Step back"
                    >
                      <ChevronLeft size={11} strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => jumpToRouteIndex(Math.min(route.path.length - 1, simulation.currentIndex + STEP_OFFSET))}
                      disabled={!route?.path?.length || simulation.currentIndex >= route.path.length - 1}
                      title="Fast Forward"
                      className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-[19.2px] h-[19.2px] flex items-center justify-center rounded-md bg-white/80 text-slate-700 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none transition-all opacity-60 hover:opacity-100"
                      aria-label="Fast Forward"
                    >
                      <ChevronRight size={11} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {clickedLocation && (
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 z-[1000] w-[85%] max-w-[300px] pointer-events-auto">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-slate-200 relative">
            <button onClick={() => setClickedLocation(null)} title="Close" className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-1.5"><X size={10} /></button>
            <p className="text-slate-800 text-[12px] font-bold truncate">{clickedLocation.name}</p>
            <p className="text-slate-500 text-[10px] mb-2">
              {clickedLocation.lat.toFixed(4)}, {clickedLocation.lng.toFixed(4)}
              {clickedLocation.elevation != null
                ? ` · Elevation ${Math.round(clickedLocation.elevation)}m`
                : ' · Elevation —'}
            </p>
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              <button onClick={handleSetStart} title="Set as Start" className="py-2 bg-blue-50 text-blue-700 rounded-xl text-[9px] font-black tracking-tighter uppercase">START (A)</button>
              <button onClick={handleAddWaypoint} disabled={waypoints.length >= 3} title="Add Waypoint" className={`py-2 rounded-xl text-[9px] font-black tracking-tighter uppercase flex items-center justify-center gap-0.5 ${waypoints.length >= 3 ? 'bg-slate-100 text-slate-400' : 'bg-amber-50 text-amber-700'}`}>
                <Plus size={10} /> WAYPOINT ({waypoints.length}/3)
              </button>
              <button onClick={handleSetEnd} title="Set as Destination" className="py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black tracking-tighter uppercase">END (B)</button>
            </div>
          </div>
        </div>
      )}

      {/* About Page — same vertical extent as map; inner scroll (About uses flex + overflow-y-auto) */}
      {showAbout && (
        <div
          className="fixed left-0 right-0 top-0 z-[1100] flex flex-col overflow-hidden bg-white"
          style={{
            bottom: 0,
          }}
        >
          <About
            onClose={() => setShowAbout(false)}
            onBackToMenu={() => { setShowAbout(false); setMenuOpen(true); }}
          />
        </div>
      )}
      {typeof document !== 'undefined' && menuOpen && createPortal(
        <MenuPanel
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onOpenAbout={() => setShowAbout(true)}
          menuView={menuView}
          setMenuView={setMenuView}
          elevationEngine={elevationEngine}
          onElevationEngineChange={persistElevationEngine}
          valhallaElevationConfigured={isValhallaElevationConfigured()}
        />,
        document.body
      )}
      {/* Hamburger menu - top-left (above search so always clickable) */}
      <button
        type="button"
        onPointerDown={stopPointerPropagation}
        onTouchStart={stopPointerPropagation}
        onTouchEnd={(e) => activateFromTouchEnd(e, () => { setMenuView('list'); setMenuOpen(true); })}
        onClick={() => { setMenuView('list'); setMenuOpen(true); }}
        title="App Info"
        className="fixed z-[1000] w-[2.4rem] h-[2.4rem] rounded-full bg-white/95 backdrop-blur-md shadow-2xl border-2 border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 active:scale-95 transition-all pointer-events-auto touch-manipulation"
        style={{
          left: 'calc(env(safe-area-inset-left, 0px) + 1rem)',
          top: SAFE_TOP_1REM,
        }}
        aria-label="Open menu"
      >
        <Menu size={20} className="pointer-events-none" />
      </button>

    </div>
  );
};
export default App;
