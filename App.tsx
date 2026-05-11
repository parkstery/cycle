
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  X,
  MapPin,
  Map as MapIcon,
  Mountain,
  Satellite,
  AreaChart as AreaChartIcon,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  History,
  Activity,
  ShieldAlert,
  Bike,
  Footprints,
  Car,
  Waypoints,
  ArrowUpDown,
  Plus,
  Minus,
  Layers,
  Star,
  Square,
  Mic,
  Music,
  Menu,
  MessageSquare,
  Gauge,
  Bluetooth,
  Box,
  Camera,
  Aperture,
  LocateFixed,
  Move,
  type LucideIcon,
} from 'lucide-react';
import ElevationChartView from './ElevationChartView';
import About from './About';
import MenuPanel from './MenuPanel';
import {
  RouteInfo,
  TravelMode,
  SimulationState,
  CoachingData,
  SavedRoute,
  AppPhase,
  SavedRoutePayload,
  ExploreRouteDisplay,
  EXPLORE_SCENE_CATEGORIES,
  type ExploreSceneCategory
} from './types';
import { getAdvancedCoaching, getPredictiveCoaching, getCourseBriefing, getRideEncouragement, pickFreshTipForResistance, parseResistanceBand } from './services/aiCoach';
import * as placeGeocode from './services/placeGeocode';
import type { SearchSuggestionItem } from './services/placeGeocode';
import * as openElevation from './services/openElevation';
import { applyRoadElevationModel } from './services/roadElevation';
import { getValhallaElevationAlongOsrmPath, isValhallaElevationConfigured } from './services/valhallaElevation';
import { fetchOsrmRouteJson, type OsrmRouteResponse } from './services/osrmRoute';
import { Capacitor, SystemBars, SystemBarType } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { AdMob, RewardAdOptions, InterstitialAdPluginEvents } from '@capacitor-community/admob';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import {
  decodePath,
  computeDistanceBetween,
  computeHeading,
  computeOffset,
  densifyPolylineFixedIntervalM,
  getLatLngAtDistanceAlongPath,
  indexAtOrBeforeCumulativeDistance,
} from './services/geoUtils';
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import { MAPBOX_ACCESS_TOKEN } from './mapboxToken';
import { MAPILLARY_CLIENT_TOKEN } from './mapillaryToken';
import { loadMapboxGl } from './services/mapboxGlLazy';
import {
  ROUTE_LAYER,
  clearRouteLineGeometry,
  ensureRouteLineLayer,
  fitMapToPath,
  mapStyleUrl,
  setRouteCorridorVisibility,
  setRouteLineGeometry,
} from './services/mapboxRouteLayer';
import {
  ensureMapillaryCoverageLayer,
  MAPILLARY_SEQUENCE_LAYER_ID,
  setMapillaryCoverageLayersVisibility,
  stackMapillaryBelowRoutableRoads,
} from './services/mapillaryCoverage';
import {
  chooseMapillaryPickAlongPath,
  driveHeadingAtPathIndex,
  MAPILLARY_STREET_LOOKAHEAD_SAMPLES_DENSE_M,
  pathPointAhead,
  queryMapillaryAlongPathSamples,
} from './services/mapillaryStreetView';
import { MapillaryRideViewer } from './MapillaryRideViewer';
import { snapRoutingChainToMapillaryParallel } from './services/mapillaryRouteSnap';
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

const FAVORITE_ROUTES_STORAGE_KEY = 'favorite_routes';
const FAVORITE_ROUTES_INIT_VERSION_KEY = 'favorite_routes_init_version';
const BUNDLED_MY_ROUTES_VERSION = 2;

/** 마커 PNG를 바꿀 때마다 숫자만 올리면 동일 파일명이라도 WebView가 새 파일을 받기 쉽다. */
const CYCLING_MARKER_ASSET_REVISION = 4;
/** 주행 마커 PNG — 후면 실루엣 (`public/cycling_position_marker_rear.png`). 옆모습으로 바꿀 때는 파일명·revision 함께 조정. */
const CYCLING_POSITION_MARKER_URL =
  '/cycling_position_marker_rear.png?v=' + CYCLING_MARKER_ASSET_REVISION;

/** 피처 플래그: 저장된 경로를 OSRM/Elevation 재호출 없이 오프라인 복원. 문제 발생 시 false 로 내려 기존(재탐색) 동작으로 폴백. */
const USE_OFFLINE_ROUTE_RESTORE = true;

/** 저장 payload 의 현재 스키마 버전. */
const SAVED_ROUTE_PAYLOAD_VERSION = 2 as const;

/**
 * 맵·시뮬·저장용 주행 경로 샘플 간격(m). OSRM 꼭짓점 폴리라인을 따라 누적거리 보간(densifyPolylineFixedIntervalM).
 * Mapillary 전용 더 촘촘한 경로는 MAPILLARY_QUERY_PATH_INTERVAL_M + fullGeometry 로 별도 생성.
 */
const ROUTE_RENDER_DENSIFY_INTERVAL_M = 18;
/** Mapillary 조회: OSRM 원본(fullGeometry) 기준 12m — 렌더 경로보다 촘촘히 옆도로 nearest 오인 방지 */
const MAPILLARY_QUERY_PATH_INTERVAL_M = 12;
/** Slow-route dialog if geocode+OSRM not finished by this time (per-phase; calculation keeps running). */
const ROUTE_PHASE_SLOW_MODAL_MS = 10000;
/** Slow-route dialog if elevation fetch not finished this long after the elevation phase starts. */
const ELEVATION_PHASE_SLOW_MODAL_MS = 10000;
const ROUTABLE_ROAD_LAYER_ID = 'routable-roads-overlay';
const MAPBOX_COMPOSITE_SOURCE_ID = 'composite';
const TERRAIN_SOURCE_ID = 'mapbox-dem';
const BUILDING_LAYER_ID = '3d-buildings';
const RIDE_CAMERA_REAR_OFFSET_M = 5;
const RIDE_CAMERA_ZOOM = 18;
const RIDE_CAMERA_PITCH = 62;
const SIMULATION_MARKER_SIZE_PX = 120;
const RIDE_CAMERA_TRACK_DURATION_MS = 160;
const RIDE_CAMERA_SMOOTHING_MS = 260;
/** 주행 인덱스 갱신 주기(ms): 값이 작을수록 마커 이동이 부드럽다. */
const SIMULATION_PROGRESS_TICK_MS = 33;
const MAPILLARY_STREET_FETCH_THROTTLE_MS = 780;
const MAPILLARY_STREET_FETCH_MIN_MOVE_M = 24;
/** 같은 프레임 유지 최소 시간 — 촘촘한 구간에서 다음 키로 넘기기 위해 짧게 */
const MAPILLARY_STREET_MIN_HOLD_MS = 1350;
/** 직전 촬영점 대비 허용 GPS 점프(m) — `chooseMapillaryPickAlongPath` */
const MAPILLARY_STREET_MAX_GPS_JUMP_M = 58;
const MAPILLARY_STREET_NO_HIT_GRACE_MS = 9000;

/** 메뉴·URL과 연동되는 표고 엔진 선택값 (localStorage). */
const ELEVATION_ENGINE_STORAGE_KEY = 'cycle_elevation_engine';
const DEFAULT_ROUTE_ASSET_PATHS = [
  'my-routes/default-slot-1.json',
  'my-routes/default-slot-2.json',
  'my-routes/default-slot-3.json',
  'my-routes/default-slot-4.json',
  'my-routes/default-slot-5.json'
] as const;

const EXPLORE_ROUTE_ASSET_PATHS = [
  'explore-routes/explore-slot-1.json',
  'explore-routes/explore-slot-2.json',
  'explore-routes/explore-slot-3.json',
  'explore-routes/explore-slot-4.json',
  'explore-routes/explore-slot-5.json',
  'explore-routes/explore-slot-6.json',
  'explore-routes/explore-slot-7.json',
  'explore-routes/explore-slot-8.json',
  'explore-routes/explore-slot-9.json',
  'explore-routes/explore-slot-10.json',
  'explore-routes/explore-slot-11.json',
  'explore-routes/explore-slot-12.json'
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

/** [lat,lng] 배열을 폴리라인 누적거리 기준으로 보간 (calculateRoute·오프라인 복원과 동일) */
const densifyLatLngPath = (
  latLngs: [number, number][],
  intervalM: number = ROUTE_RENDER_DENSIFY_INTERVAL_M
): [number, number][] => densifyPolylineFixedIntervalM(latLngs, intervalM);

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

/** 경로 설정·Explore 목록과 동일: 거리(m) ÷ 사용자 평균 속도(km/h) → `formatDurationSimple` 과 동일 규칙의 표시 문자열 */
function formatDurationSimpleFromMetersAndSpeed(
  totalMeters: number | null | undefined,
  speedKmH: number,
  distanceTextFallback?: string
): string {
  let m = totalMeters;
  if (m == null || !Number.isFinite(m) || m <= 0) {
    const raw = String(distanceTextFallback ?? '').replace(/[^0-9.]/g, '');
    const km = parseFloat(raw);
    m = Number.isFinite(km) && km > 0 ? km * 1000 : 0;
  }
  if (m <= 0 || !speedKmH || speedKmH <= 0) return '0:00';
  const totalSeconds = m / (speedKmH * 1000 / 3600);
  if (!isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const h = Math.floor(totalSeconds / 3600);
  const min = Math.round((totalSeconds % 3600) / 60);
  return `${h}:${min.toString().padStart(2, '0')}`;
}

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

const coordLat = (p: any): number => (typeof p.lat === 'function' ? p.lat() : p.lat);
const coordLng = (p: any): number => (typeof p.lng === 'function' ? p.lng() : p.lng);

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

const hydrateExploreRoute = (route: SavedRoute, idx: number, now: number): SavedRoute => ({
  ...route,
  id: route.id || `explore-slot-${idx + 1}`,
  source: 'EXPLORE',
  bundledId: route.bundledId || `explore-slot-${idx + 1}`,
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

const loadBundledExploreRoutes = async (): Promise<SavedRoute[]> => {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  const now = Date.now();
  const settled = await Promise.allSettled(
    EXPLORE_ROUTE_ASSET_PATHS.map(async (assetPath, idx) => {
      const response = await fetch(`${base}${assetPath}`);
      if (!response.ok) throw new Error(`Failed to load ${assetPath}`);
      const json = await response.json();
      return hydrateExploreRoute(json as SavedRoute, idx, now);
    })
  );
  const loaded: SavedRoute[] = [];
  settled.forEach((r, idx) => {
    if (r.status === 'fulfilled') loaded.push(r.value);
    else console.warn('[EXPLORE_ROUTES] skip', EXPLORE_ROUTE_ASSET_PATHS[idx], r.reason);
  });
  return loaded;
};

function inferExploreScene(d: ExploreRouteDisplay): ExploreSceneCategory {
  if (d.scene && (EXPLORE_SCENE_CATEGORIES as readonly string[]).includes(d.scene)) return d.scene;
  const tags = (d.tags || []).map((t) => String(t).toLowerCase());
  if (tags.some((t) => /desert|heritage|sand|wadi/.test(t))) return 'desert';
  if (tags.some((t) => /river|한강/.test(t))) return 'river';
  if (tags.some((t) => /\blake\b|lucerne|lac/.test(t))) return 'lake';
  if (tags.some((t) => /ocean|sea|coastal|islands|surf|gor|beach|cliff/.test(t))) return 'sea';
  if (tags.some((t) => /urban|city/.test(t))) return 'urban';
  return 'mountain';
}

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
/** OSRM·Mapillary 기본·360(3×2.4+gap) + 3D(2.4) 아래 — 우측 1rem 열과 겹치지 않게 */
const SAFE_TOP_SPEED_PANEL = `calc(${SAFE_TOP_INSET} + 14rem)`;
const SAFE_LEFT_1REM = 'calc(env(safe-area-inset-left, 0px) + 1rem)';
const SAFE_RIGHT_1REM = 'calc(env(safe-area-inset-right, 0px) + 1rem)';
/** OSRM·Mapillary 기본·360 세로 스택(gap-0.5) 아래 3D 버튼 상단 */
const SAFE_TOP_3D_BTN = `calc(${SAFE_TOP_INSET} + 11.1rem)`;
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

/** 주행 위치 강제 이동 시 한 번에 이동할 경로 포인트 수 (Backward / Fast Forward) */
const STEP_OFFSET = 5;

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

function fallbackExploreDisplay(route: SavedRoute): ExploreRouteDisplay {
  const tm = route.routePayload?.totalDistanceMeters;
  return {
    title: (route.origin || '').split(',')[0]?.trim() || route.id,
    country: '—',
    city: '—',
    distanceKm: tm != null ? Math.round((tm / 1000) * 10) / 10 : 0,
    elevationGain: 0,
    difficulty: 'moderate',
    tags: []
  };
}

function getExploreRouteDisplay(route: SavedRoute): ExploreRouteDisplay {
  if (route.exploreDisplay?.title) return route.exploreDisplay;
  return fallbackExploreDisplay(route);
}

function ExploreRouteRow({
  route,
  onPick,
  compact,
  speedKmH
}: {
  route: SavedRoute;
  onPick: (r: SavedRoute) => void;
  compact?: boolean;
  /** 설정과 동일 기준(거리÷평균 속도) 예상 주행 시간 표시 */
  speedKmH?: number;
}) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  const d = getExploreRouteDisplay(route);
  const scene = inferExploreScene(d);
  const sceneUrl = `${base}explore-scene/${scene}.svg`;
  const ready = !!route.routePayload?.fullGeometry?.length;
  const loc = [d.city, d.country].filter((x) => x && String(x).trim() && x !== '—').join(', ');
  const line2Parts: string[] = [];
  if (loc) line2Parts.push(loc);
  line2Parts.push(`${d.distanceKm} km`, `${d.elevationGain} m↑`, String(d.difficulty || '').toLowerCase());
  if (speedKmH != null && speedKmH > 0 && route.routePayload) {
    const eta = formatDurationSimpleFromMetersAndSpeed(
      route.routePayload.totalDistanceMeters,
      speedKmH,
      route.routePayload.distance
    );
    line2Parts.push(`~${eta}`);
  }
  if (d.tags?.length) line2Parts.push(...d.tags);
  const line2 = line2Parts.join(' · ');
  const titleCls = compact ? 'text-[12px]' : 'text-[13px]';
  const subCls = compact ? 'text-[10px]' : 'text-[11px]';
  const thumbCls = compact ? 'h-10 w-10 shrink-0 rounded-lg' : 'h-11 w-11 shrink-0 rounded-lg';
  return (
    <button
      type="button"
      onClick={() => onPick(route)}
      className={`w-full rounded-xl border border-slate-200 bg-white text-left shadow-sm transition-colors hover:bg-slate-50 active:bg-slate-100 ${compact ? 'py-2 px-2.5' : 'py-2.5 px-3'}`}
    >
      <div className="flex min-w-0 gap-2.5">
        <div className={`${thumbCls} overflow-hidden border border-slate-200 bg-slate-100`}>
          <img src={sceneUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className={`min-w-0 truncate font-extrabold leading-tight text-slate-900 ${titleCls}`}>{d.title}</span>
            <span className={`shrink-0 font-black uppercase tracking-wide ${ready ? 'text-emerald-600' : 'text-amber-600'} ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
              {ready ? 'READY' : 'SYNC'}
            </span>
          </div>
          <div className={`mt-0.5 min-w-0 leading-snug text-slate-600 ${subCls} line-clamp-2`}>{line2}</div>
        </div>
      </div>
    </button>
  );
}

/** 지도 스타일 4종 — 버튼 순서: 일반 → 아웃도어 → 위성 → 위성+도로 */
const MAP_STYLE_CONTROLS: {
  id: 'streets' | 'outdoors' | 'satellite' | 'hybrid';
  title: string;
  Icon: LucideIcon;
}[] = [
  { id: 'streets', title: '일반 지도', Icon: MapIcon },
  { id: 'outdoors', title: '아웃도어 맵', Icon: Mountain },
  { id: 'satellite', title: '위성', Icon: Satellite },
  { id: 'hybrid', title: '위성 + 도로', Icon: Layers },
];

const App: React.FC = () => {
  // Map & Service References
  const mapRef = useRef<HTMLDivElement>(null);

  const mapboxMapRef = useRef<MapboxMap | null>(null);
  /** 동적 import 로 로드된 mapbox-gl 기본 export (Map/Marker 생성용) */
  const mapboxGlRef = useRef<typeof import('mapbox-gl').default | null>(null);
  /** OSRM/복원 경로를 GeoJSON 라인으로 그릴 때 최신 path 보관 (style.load 시 재적용) */
  const routeLinePathRef = useRef<any[]>([]);
  const mapMarkersRef = useRef<MapboxMarker[]>([]);
  const simulationMarker = useRef<MapboxMarker | null>(null);
  const startMarker = useRef<MapboxMarker | null>(null);
  const endMarker = useRef<MapboxMarker | null>(null);
  const waypointMarkers = useRef<MapboxMarker[]>([]);
  const tempMarker = useRef<MapboxMarker | null>(null);
  const searchMarkerRef = useRef<MapboxMarker | null>(null);

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
  const triggerMapResize = useCallback((map?: MapboxMap | null) => {
    const targetMap = map ?? mapboxMapRef.current;
    if (!targetMap) return false;
    try {
      targetMap.resize();
      return true;
    } catch (e) {
      console.warn('[Mapbox] resize skipped:', e);
      return false;
    }
  }, []);

  const applyMap3DState = useCallback((map?: MapboxMap | null) => {
    const target = map ?? mapboxMapRef.current;
    if (!target) return;
    try {
      if (map3DEnabledRef.current) {
        if (!target.getSource(TERRAIN_SOURCE_ID)) {
          target.addSource(TERRAIN_SOURCE_ID, {
            type: 'raster-dem',
            url: 'mapbox://mapbox.terrain-rgb',
            tileSize: 512,
            maxzoom: 14,
          });
        }
        target.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1.3 });
        if (!target.getLayer(BUILDING_LAYER_ID) && target.getSource(MAPBOX_COMPOSITE_SOURCE_ID)) {
          const layers = target.getStyle().layers || [];
          const labelLayer = layers.find((layer) => layer.type === 'symbol' && !!layer.layout?.['text-field']);
          target.addLayer(
            {
              id: BUILDING_LAYER_ID,
              source: MAPBOX_COMPOSITE_SOURCE_ID,
              'source-layer': 'building',
              filter: ['==', 'extrude', 'true'],
              type: 'fill-extrusion',
              minzoom: 15,
              paint: {
                'fill-extrusion-color': '#cbd5e1',
                'fill-extrusion-height': ['get', 'height'],
                'fill-extrusion-base': ['get', 'min_height'],
                'fill-extrusion-opacity': 0.6,
              },
            },
            labelLayer?.id
          );
        }
        target.easeTo({ pitch: 60, bearing: -20, duration: 450 });
      } else {
        target.setTerrain(null);
        if (target.getLayer(BUILDING_LAYER_ID)) target.removeLayer(BUILDING_LAYER_ID);
        target.easeTo({ pitch: 0, duration: 300 });
      }
    } catch (e) {
      console.warn('[Mapbox] 3D state apply failed', e);
    }
  }, []);

  const rideCameraTargetRef = useRef<null | { lng: number; lat: number; bearing: number; pitch: number; zoom: number }>(null);
  const rideCameraStateRef = useRef<null | { lng: number; lat: number; bearing: number; pitch: number; zoom: number }>(null);
  const rideCameraRafRef = useRef<number | null>(null);
  const rideCameraLastFrameMsRef = useRef(0);
  /** 주행 중 후방 추적 카메라 — off 시 RAF 중단·맵은 사용자(마우스·터치) 조작 */
  const [rideRearCameraFollow, setRideRearCameraFollow] = useState(true);
  const rideRearCameraFollowRef = useRef(true);
  rideRearCameraFollowRef.current = rideRearCameraFollow;
  const rideRearCameraFollowPrevRef = useRef(true);

  const startRideCameraLoop = useCallback(() => {
    if (rideCameraRafRef.current != null) return;

    const step = (now: number) => {
      rideCameraRafRef.current = null;
      const map = mapboxMapRef.current;
      const target = rideCameraTargetRef.current;
      if (!map || !target) {
        rideCameraLastFrameMsRef.current = 0;
        return;
      }
      if (!rideRearCameraFollowRef.current) {
        rideCameraLastFrameMsRef.current = 0;
        return;
      }

      const currentCenter = map.getCenter();
      const currentState = rideCameraStateRef.current ?? {
        lng: currentCenter.lng,
        lat: currentCenter.lat,
        bearing: map.getBearing(),
        pitch: map.getPitch(),
        zoom: map.getZoom(),
      };
      const lastFrameMs = rideCameraLastFrameMsRef.current || now;
      const dt = Math.max(1, Math.min(80, now - lastFrameMs));
      rideCameraLastFrameMsRef.current = now;
      const t = 1 - Math.exp(-dt / RIDE_CAMERA_SMOOTHING_MS);
      const bearingDelta = ((target.bearing - currentState.bearing + 540) % 360) - 180;
      const nextState = {
        lng: currentState.lng + (target.lng - currentState.lng) * t,
        lat: currentState.lat + (target.lat - currentState.lat) * t,
        bearing: currentState.bearing + bearingDelta * t,
        pitch: currentState.pitch + (target.pitch - currentState.pitch) * t,
        zoom: currentState.zoom + (target.zoom - currentState.zoom) * t,
      };

      rideCameraStateRef.current = nextState;
      map.jumpTo({
        center: [nextState.lng, nextState.lat],
        bearing: nextState.bearing,
        pitch: nextState.pitch,
        zoom: nextState.zoom,
      });

      const nearTarget =
        computeDistanceBetween({ lat: nextState.lat, lng: nextState.lng }, { lat: target.lat, lng: target.lng }) < 0.15 &&
        Math.abs(bearingDelta) < 0.2 &&
        Math.abs(nextState.zoom - target.zoom) < 0.01 &&
        Math.abs(nextState.pitch - target.pitch) < 0.1;
      if (rideRearCameraFollowRef.current && (simulationActiveRef.current || !nearTarget)) {
        rideCameraRafRef.current = window.requestAnimationFrame(step);
      } else {
        rideCameraLastFrameMsRef.current = 0;
      }
    };

    rideCameraRafRef.current = window.requestAnimationFrame(step);
  }, []);

  const trackRiderCamera = useCallback((currentPos: any, nextPos?: any, duration = 0) => {
    if (!rideRearCameraFollowRef.current) return;
    const map = mapboxMapRef.current;
    if (!map || !currentPos) return;
    const lat = typeof currentPos.lat === 'function' ? currentPos.lat() : currentPos.lat;
    const lng = typeof currentPos.lng === 'function' ? currentPos.lng() : currentPos.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    let heading = Number.isFinite(map.getBearing()) ? map.getBearing() : 0;
    if (nextPos) {
      try {
        const computedHeading = computeHeading(currentPos, nextPos);
        if (Number.isFinite(computedHeading)) heading = computedHeading;
      } catch {
        // 경로 끝이나 좌표 형식 문제에서는 직전 bearing 을 유지한다.
      }
    }

    const cameraPos = computeOffset({ lat, lng }, RIDE_CAMERA_REAR_OFFSET_M, heading + 180);
    if (duration >= 400) {
      rideCameraStateRef.current = null;
      rideCameraLastFrameMsRef.current = 0;
    }
    rideCameraTargetRef.current = {
      lng: cameraPos.lng,
      lat: cameraPos.lat,
      bearing: heading,
      pitch: RIDE_CAMERA_PITCH,
      zoom: Math.max(map.getZoom(), RIDE_CAMERA_ZOOM),
    };
    startRideCameraLoop();
  }, [startRideCameraLoop]);

  // App Core State
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const routeRef = useRef<RouteInfo | null>(null); // stale closure 방지용 route 참조
  const [simulation, setSimulation] = useState<SimulationState>({
    isActive: false,
    currentIndex: 0,
    alongRouteM: 0,
    speed: 100,
  });
  /** 거리뷰 Graph fetch: currentIndex 를 effect deps 에 넣으면 매 틱 cleanup 이 fetch 를 abort 하므로 ref 로만 추적 */
  const simulationIndexForStreetRef = useRef(0);
  simulationIndexForStreetRef.current = simulation.currentIndex;

  /** 주행 path 각 점의 누적 거리(m) — 연속 마커 보간·시뮬 진행·후방 카메라 공통 */
  const routeCumulativeDistancesM = useMemo((): number[] | null => {
    if (!route?.path?.length) return null;
    const path = route.path;
    const cd = route.cumulativeDistances;
    if (cd?.length === path.length) return cd;
    const pairs: [number, number][] = path.map((p: any) => [fix8(coordLat(p)), fix8(coordLng(p))]);
    return computeCumulativeDistances(pairs);
  }, [route?.path, route?.cumulativeDistances]);

  useEffect(() => {
    if (rideRearCameraFollow) return;
    if (rideCameraRafRef.current != null) {
      window.cancelAnimationFrame(rideCameraRafRef.current);
      rideCameraRafRef.current = null;
    }
    rideCameraTargetRef.current = null;
    rideCameraStateRef.current = null;
    rideCameraLastFrameMsRef.current = 0;
    const map = mapboxMapRef.current;
    if (map) {
      try {
        map.scrollZoom.enable();
        map.dragPan.enable();
        map.touchZoomRotate.enable();
        map.doubleClickZoom.enable();
        map.boxZoom.enable();
        map.keyboard.enable();
      } catch {
        /* 일부 핸들러 미지원 환경 */
      }
    }
  }, [rideRearCameraFollow]);

  useEffect(() => {
    const turnedOn = rideRearCameraFollow && !rideRearCameraFollowPrevRef.current;
    rideRearCameraFollowPrevRef.current = rideRearCameraFollow;
    if (!turnedOn) return;
    if (!simulation.isActive || !route?.path?.length || !routeCumulativeDistancesM?.length) return;
    const path = route.path;
    const cum = routeCumulativeDistancesM;
    const total = cum[cum.length - 1] ?? 0;
    const along = Math.max(0, Math.min(simulation.alongRouteM ?? 0, total));
    const cur = getLatLngAtDistanceAlongPath(path, cum, along);
    const ahead = getLatLngAtDistanceAlongPath(path, cum, Math.min(along + 14, total));
    trackRiderCamera({ lat: cur.lat, lng: cur.lng }, { lat: ahead.lat, lng: ahead.lng }, 450);
  }, [rideRearCameraFollow, simulation.isActive, simulation.alongRouteM, route?.path, routeCumulativeDistancesM, trackRiderCamera]);
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
  const sensorCapacityLiveRef = useRef(90);
  const sensorCapacitySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SENSOR_RPM_HOLD_MS = 2000;
  const SENSOR_MOVE_STOP_KMH = 0.2;
  const SENSOR_PEDALING_RPM_THRESHOLD = 8;
  const SENSOR_NO_PACKET_FORCE_ZERO_MS = 3500;
  const SENSOR_DISPLAY_ZERO_RPM = 1;
  const SENSOR_HARD_ZERO_MS = 2500;
  const [mode, setMode] = useState<TravelMode>(TravelMode.DRIVING);
  const [loading, setLoading] = useState(false);
  const routeCalcSessionRef = useRef(0);
  const routeCalcActiveRef = useRef(false);
  const routePhaseDoneRef = useRef(false);
  const elevationPhaseDoneRef = useRef(false);
  const routeSlowModalTimer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeSlowModalTimer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [routeSlowModalOpen, setRouteSlowModalOpen] = useState(false);
  const [explorePickerOpen, setExplorePickerOpen] = useState(false);
  const slowModalVisibleSinceRef = useRef<number | null>(null);
  const accumulatedSlowModalMsRef = useRef(0);
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
  const [routeSource, setRouteSource] = useState<'OSRM' | null>(null);
  const [mapType, setMapType] = useState<'streets' | 'outdoors' | 'satellite' | 'hybrid'>('streets');
  const mapTypeRef = useRef(mapType);
  mapTypeRef.current = mapType;
  const [map3DEnabled, setMap3DEnabled] = useState(false);
  const map3DEnabledRef = useRef(map3DEnabled);
  map3DEnabledRef.current = map3DEnabled;
  /** OSRM으로 계산된 경로를 파란 코리더로 강조 (Street View 커버리지와 별개 — 실제 라우트 구간만) */
  /** Mapillary 시퀀스 커버리지(벡터 타일). 토큰이 있을 때만 레이어·토글 표시 */
  const mapillaryTokenConfigured = MAPILLARY_CLIENT_TOKEN.length > 0;
  /** Mapillary 시퀀스(일반 촬영 경로) 레이어 */
  const [mapillaryBasicCoverageVisible, setMapillaryBasicCoverageVisible] = useState(mapillaryTokenConfigured);
  const mapillaryBasicCoverageVisibleRef = useRef(mapillaryBasicCoverageVisible);
  mapillaryBasicCoverageVisibleRef.current = mapillaryBasicCoverageVisible;
  /** Mapillary 360°(파노) 구간 강조 레이어 — 기본 커버리지와 별도 토글 */
  const [mapillaryPanoCoverageVisible, setMapillaryPanoCoverageVisible] = useState(mapillaryTokenConfigured);
  const mapillaryPanoCoverageVisibleRef = useRef(mapillaryPanoCoverageVisible);
  mapillaryPanoCoverageVisibleRef.current = mapillaryPanoCoverageVisible;
  /** 터치 후 ghost click 으로 Mapillary/OSRM 도로 토글이 두 번 뒤집히는 것 방지 */
  const lastMapillaryBasicUiToggleMsRef = useRef(0);
  const lastMapillaryPanoUiToggleMsRef = useRef(0);
  const lastRouteCoverageUiToggleMsRef = useRef(0);
  /** 주행 중 경로상 Mapillary 임베드 거리뷰(커버리지 있을 때만) */
  const [rideMapillaryStreet, setRideMapillaryStreet] = useState<
    null | { imageKey: string; shownAtMs: number; isPano?: boolean }
  >(null);
  const rideMapillaryStreetRef = useRef(rideMapillaryStreet);
  rideMapillaryStreetRef.current = rideMapillaryStreet;
  const lastMapillaryStreetFetchAtRef = useRef(0);
  const lastMapillaryStreetAnchorRef = useRef<{ lat: number; lng: number } | null>(null);
  const mapillaryStreetFetchGenRef = useRef(0);
  /** 사용자가 닫은 프레임 — 같은 imageKey 가 다시 잡히면 자동 재오픈하지 않음 */
  const lastMapillaryStreetDismissedKeyRef = useRef<string | null>(null);
  /** 직전에 표시한 촬영점 — 다음 선택 시 연속·시퀀스 우선 */
  const lastMapillaryStreetPickRef = useRef<{
    id: string;
    lat: number;
    lng: number;
    sequenceId?: string;
  } | null>(null);
  /** 일시정지 시에는 거리뷰 유지 — 완전 종료·경로 제거·재탐색 시에만 호출 */
  const resetRideMapillaryStreetState = useCallback(() => {
    lastMapillaryStreetAnchorRef.current = null;
    lastMapillaryStreetFetchAtRef.current = 0;
    lastMapillaryStreetDismissedKeyRef.current = null;
    mapillaryStreetFetchGenRef.current += 1;
    lastMapillaryStreetPickRef.current = null;
    setRideMapillaryStreet(null);
  }, []);
  /** Mapillary Graph 샘플링: OSRM fullGeometry 기준 촘촘한 경로(렌더 path 와 분리) */
  const mapillaryStreetDensePathChunks = useMemo(() => {
    if (!route?.path?.length) return null;
    const sparseLatLng: [number, number][] = route.path.map(
      (p: any) => [fix8(coordLat(p)), fix8(coordLng(p))] as [number, number]
    );
    const cumSparse = computeCumulativeDistances(sparseLatLng);
    const src =
      lastOsrmDecodedPathRef.current && lastOsrmDecodedPathRef.current.length >= 2
        ? lastOsrmDecodedPathRef.current
        : sparseLatLng;
    const denseLatLng = densifyPolylineFixedIntervalM(src, MAPILLARY_QUERY_PATH_INTERVAL_M);
    const densePath = denseLatLng.map(([lat, lng]) => ({ lat, lng }));
    const cumDense = computeCumulativeDistances(denseLatLng);
    return { densePath, cumDense, cumSparse };
  }, [route?.path]);
  /** Mapillary 뷰어 시야: 촘촘 경로 기준 전방점 + 주행 방위 */
  const mapillaryRideSync = useMemo(() => {
    if (!route?.path?.length) {
      return { lookAt: null as { lat: number; lng: number } | null, driveHeadingDeg: null as number | null };
    }
    const path = route.path;
    const idx = Math.min(Math.max(0, simulation.currentIndex), path.length - 1);
    const chunks = mapillaryStreetDensePathChunks;
    let ahead = pathPointAhead(path, idx, 52);
    let driveH = driveHeadingAtPathIndex(path, idx);
    if (chunks) {
      const d = chunks.cumSparse[Math.min(idx, chunks.cumSparse.length - 1)] ?? 0;
      const denseIdx = indexAtOrBeforeCumulativeDistance(chunks.cumDense, d);
      const a = pathPointAhead(chunks.densePath, denseIdx, 52);
      if (a) ahead = a;
      driveH = driveHeadingAtPathIndex(chunks.densePath, denseIdx) ?? driveH;
    }
    return {
      lookAt: ahead ? { lat: ahead.lat, lng: ahead.lng } : null,
      driveHeadingDeg: driveH,
    };
  }, [route?.path, simulation.currentIndex, mapillaryStreetDensePathChunks]);
  const [showAbout, setShowAbout] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<'list' | 'about' | 'guideSimple' | 'guideDetail' | 'privacy' | 'terms' | 'disclaimer' | 'licenses' | 'contact'>('list');

  // Independent Timer States for Elevation Chart
  const [elapsedTime, setElapsedTime] = useState(0);
  const [coveredDistance, setCoveredDistance] = useState(0);

  // Advanced Coach State
  const [coachData, setCoachData] = useState<CoachingData | null>(null);
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
  const [routeCoverageVisible, setRouteCoverageVisible] = useState(true);
  const routeCoverageVisibleRef = useRef(routeCoverageVisible);
  routeCoverageVisibleRef.current = routeCoverageVisible;
  const [historyExpanded, setHistoryExpanded] = useState(false); // 초기 실행 시 My Routes 패널 접힌 상태
  /** Right route list: user My Routes vs curated Explore Routes (cloud + local cache). */
  const [historyPanelTab, setHistoryPanelTab] = useState<'my_routes' | 'explore'>('my_routes');
  const absorbRouteSlowModalVisibleTime = useCallback(() => {
    if (slowModalVisibleSinceRef.current != null) {
      accumulatedSlowModalMsRef.current += performance.now() - slowModalVisibleSinceRef.current;
      slowModalVisibleSinceRef.current = null;
    }
  }, []);
  const handleRouteSlowModalKeepWaiting = useCallback(() => {
    absorbRouteSlowModalVisibleTime();
    setRouteSlowModalOpen(false);
  }, [absorbRouteSlowModalVisibleTime]);
  const handleRouteSlowModalRideExplore = useCallback(() => {
    absorbRouteSlowModalVisibleTime();
    setRouteSlowModalOpen(false);
    setExplorePickerOpen(true);
  }, [absorbRouteSlowModalVisibleTime]);
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
  /** Maps JS/키/컨테이너 준비 실패 시 사용자에게 표시(인트로는 걷어서 콘트롤은 보이게 함). */
  const [mapBootstrapError, setMapBootstrapError] = useState<string | null>(null);
  const [mapRevealed, setMapRevealed] = useState(false);
  /** 브라우저 Geolocation API로 얻은 사용자 현재 위치 (지도 초기 중심용) */
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Session / ads: phase (IDLE vs RUNNING for interstitial timing)
  const [appPhase, setAppPhase] = useState<AppPhase>('IDLE');

  // AdMob state (Android only). Rewarded ad insertion은 추후 진행.
  const [admobReady, setAdmobReady] = useState(false);
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
    sensorsModalOpen: false,
    bikeProfileModalOpen: false,
    explorePickerOpen: false,
    routeSlowModalOpen: false,
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
  const [exploreRoutes, setExploreRoutes] = useState<SavedRoute[]>([]);
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
    let cancelled = false;
    loadBundledExploreRoutes()
      .then((routes) => {
        if (!cancelled && routes.length > 0) setExploreRoutes(routes);
      })
      .catch((e) => {
        console.warn('[EXPLORE_ROUTES] failed to load bundled explore catalog', e);
      });
    return () => { cancelled = true; };
  }, []);

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
      sensorsModalOpen,
      bikeProfileModalOpen,
      explorePickerOpen,
      routeSlowModalOpen,
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
    sensorsModalOpen,
    bikeProfileModalOpen,
    explorePickerOpen,
    routeSlowModalOpen,
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

  /** OSRM 경로 유지, 표고만 Valhalla 옵션. URL `?elevation_engine=valhalla|open` 과 localStorage(과거 저장값 읽기)로 초기값 결정. */
  const [elevationEngine] = useState<'open' | 'valhalla'>(() => {
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
      if (!prev.some((item) => item.id === favoriteId)) return prev;
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
      return { lat, lng };
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
    const hydrateFavoriteId = saved.source === 'EXPLORE' ? undefined : saved.id;
    await calculateRoute(fallbackMode, false, saved.origin, saved.destination, restoredWaypoints, hydrateFavoriteId);
  };

  const handleDeleteFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFavorites = favoriteRoutes.filter(r => r.id !== id);
    setFavoriteRoutes(newFavorites);
    localStorage.setItem(FAVORITE_ROUTES_STORAGE_KEY, JSON.stringify(newFavorites));
  };

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

  // Mapbox GL 베이스맵: mapRevealed 후 컨테이너가 보이고 레이아웃이 잡힌 뒤 초기화 (opacity 트랜지션은 WebGL 첫 페인트와 충돌할 수 있어 맵 div에서는 사용하지 않음)
  useEffect(() => {
    if (!mapRevealed || mapboxMapRef.current) return;
    if (!MAPBOX_ACCESS_TOKEN) {
      console.warn('[Mapbox] VITE_MAPBOX_ACCESS_TOKEN 미설정 — .env.local 참고');
      setMapBootstrapError((prev) => prev ?? 'Mapbox: 프로젝트 루트 .env.local 에 VITE_MAPBOX_ACCESS_TOKEN=pk.xxx 를 넣고 dev 서버를 재시작하세요.');
      setIsMapReady(true);
      return;
    }

    let cancelled = false;
    let bootRaf1 = 0;
    let bootRaf2 = 0;
    let retryRafId = 0;
    let attempts = 0;
    const maxAttempts = 180;

    const tryCreateMap = (mb: typeof import('mapbox-gl').default) => {
      if (cancelled || mapboxMapRef.current) return;
      const el = mapRef.current;
      if (el) {
        try {
          mb.accessToken = MAPBOX_ACCESS_TOKEN;
          const map = new mb.Map({
            container: el,
            style: mapStyleUrl(mapTypeRef.current),
            center: [126.9882, 37.5512],
            zoom: 14,
            attributionControl: MAPILLARY_CLIENT_TOKEN
              ? { compact: true, customAttribution: 'Imagery © Mapillary' }
              : true,
          });
          const ensureMapInteractionsEnabled = () => {
            try {
              map.scrollZoom.enable();
              map.dragPan.enable();
              map.touchZoomRotate.enable();
              map.doubleClickZoom.enable();
              map.boxZoom.enable();
              map.keyboard.enable();
            } catch {
              /* 일부 핸들러 미지원 환경 */
            }
          };
          ensureMapInteractionsEnabled();
          map.on('style.load', () => {
            try {
              ensureRouteLineLayer(map);
              // style 변경 후 road coverage 오버레이 재부착
              const hasOverlay = !!map.getLayer(ROUTABLE_ROAD_LAYER_ID);
              const hasCompositeSource = !!map.getSource(MAPBOX_COMPOSITE_SOURCE_ID);
              if (!hasOverlay && hasCompositeSource) {
                map.addLayer(
                  {
                    id: ROUTABLE_ROAD_LAYER_ID,
                    type: 'line',
                    source: MAPBOX_COMPOSITE_SOURCE_ID,
                    'source-layer': 'road',
                    filter: [
                      'in',
                      ['coalesce', ['get', 'class'], ''],
                      ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'street', 'street_limited', 'service', 'track', 'path', 'cycleway']],
                    ],
                    layout: {
                      visibility: routeCoverageVisibleRef.current ? 'visible' : 'none',
                      'line-cap': 'round',
                      'line-join': 'round',
                    },
                    paint: {
                      'line-color': '#22d3ee',
                      'line-opacity': 0.9,
                      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 13, 2.2, 16, 4],
                    },
                  },
                  map.getLayer(ROUTE_LAYER) ? ROUTE_LAYER : undefined
                );
              } else if (hasOverlay) {
                map.setLayoutProperty(ROUTABLE_ROAD_LAYER_ID, 'visibility', routeCoverageVisibleRef.current ? 'visible' : 'none');
              }
              applyMap3DState(map);
              if (routeLinePathRef.current.length) {
                setRouteLineGeometry(map, routeLinePathRef.current);
              } else {
                clearRouteLineGeometry(map);
              }
              setRouteCorridorVisibility(map, true);
              if (MAPILLARY_CLIENT_TOKEN) {
                ensureMapillaryCoverageLayer(map, MAPILLARY_CLIENT_TOKEN);
                stackMapillaryBelowRoutableRoads(map, ROUTABLE_ROAD_LAYER_ID);
                setMapillaryCoverageLayersVisibility(map, {
                  basic: mapillaryBasicCoverageVisibleRef.current,
                  pano360: mapillaryPanoCoverageVisibleRef.current,
                });
              }
              ensureMapInteractionsEnabled();
              map.resize();
            } catch (e) {
              console.warn('[Mapbox] style.load route layer', e);
            }
          });
          map.once('idle', () => {
            try {
              map.resize();
            } catch {
              /* ignore */
            }
          });
          map.on('click', (e) => {
            handleLocationClickRef.current(e.lngLat.lat, e.lngLat.lng);
          });
          map.on('error', (e) => {
            console.error('[Mapbox]', e);
            if (!cancelled) {
              const msg = (e as { error?: Error }).error?.message;
              setMapBootstrapError((prev) => prev ?? msg ?? 'Mapbox 지도를 불러오지 못했습니다. 토큰·네트워크를 확인하세요.');
            }
          });
          mapboxMapRef.current = map;
          requestAnimationFrame(() => {
            try {
              map.resize();
            } catch {
              /* ignore */
            }
          });
          if (!cancelled) setIsMapReady(true);
        } catch (err) {
          console.error('[Mapbox Map init]', err);
          if (!cancelled) {
            setMapBootstrapError((prev) => prev ?? 'Mapbox 지도를 초기화하지 못했습니다.');
            setIsMapReady(true);
          }
        }
        return;
      }
      attempts += 1;
      if (attempts >= maxAttempts) {
        console.error('[Mapbox Map init] mapRef not ready after', maxAttempts, 'frames');
        if (!cancelled) {
          setMapBootstrapError((prev) => prev ?? '지도 영역을 준비하지 못했습니다. 앱을 완전히 종료한 뒤 다시 실행해 주세요.');
          setIsMapReady(true);
        }
        return;
      }
      retryRafId = window.requestAnimationFrame(() => tryCreateMap(mb));
    };

    void loadMapboxGl()
      .then((mb) => {
        if (cancelled) return;
        mapboxGlRef.current = mb;
        bootRaf1 = window.requestAnimationFrame(() => {
          bootRaf2 = window.requestAnimationFrame(() => {
            tryCreateMap(mb);
          });
        });
      })
      .catch((err) => {
        console.error('[Mapbox] mapbox-gl 로드 실패', err);
        if (!cancelled) {
          setMapBootstrapError((prev) => prev ?? 'Mapbox 지도 모듈을 불러오지 못했습니다. 네트워크를 확인하세요.');
          setIsMapReady(true);
        }
      });

    return () => {
      cancelled = true;
      if (bootRaf1) window.cancelAnimationFrame(bootRaf1);
      if (bootRaf2) window.cancelAnimationFrame(bootRaf2);
      if (retryRafId) window.cancelAnimationFrame(retryRafId);
      if (rideCameraRafRef.current != null) {
        window.cancelAnimationFrame(rideCameraRafRef.current);
        rideCameraRafRef.current = null;
      }
      rideCameraTargetRef.current = null;
      rideCameraStateRef.current = null;
      rideCameraLastFrameMsRef.current = 0;
      if (mapboxMapRef.current) {
        try {
          mapboxMapRef.current.remove();
        } catch {
          /* ignore */
        }
        mapboxMapRef.current = null;
      }
      setIsMapReady(false);
    };
  }, [mapRevealed, applyMap3DState]);

  // 사용자 위치를 받으면 지도 중심을 해당 위치로 이동
  useEffect(() => {
    if (!isMapReady || !userLocation || !mapboxMapRef.current) return;
    mapboxMapRef.current.easeTo({ center: [userLocation.lng, userLocation.lat], zoom: 14, duration: 0 });
  }, [isMapReady, userLocation]);

  useEffect(() => {
    const m = mapboxMapRef.current;
    if (!m || !MAPILLARY_CLIENT_TOKEN || !isMapReady) return;

    const syncMapillaryToMap = () => {
      try {
        if (!m.isStyleLoaded()) return;
        ensureMapillaryCoverageLayer(m, MAPILLARY_CLIENT_TOKEN);
        stackMapillaryBelowRoutableRoads(m, ROUTABLE_ROAD_LAYER_ID);
        setMapillaryCoverageLayersVisibility(m, {
          basic: mapillaryBasicCoverageVisible,
          pano360: mapillaryPanoCoverageVisible,
        });
      } catch {
        /* 스타일 전환 직전 등 */
      }
    };

    syncMapillaryToMap();
    const onIdleOnce = () => {
      syncMapillaryToMap();
    };
    m.once('idle', onIdleOnce);
    return () => {
      m.off('idle', onIdleOnce);
    };
  }, [mapillaryBasicCoverageVisible, mapillaryPanoCoverageVisible, isMapReady, mapType]);

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
      placeGeocode.searchSuggestions(q, 5).then((list) => {
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
      placeGeocode.searchSuggestions(q, 5).then((list) => {
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
      placeGeocode.searchSuggestions(q, PLACE_SEARCH_SUGGEST_LIMIT).then((list) => {
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

  // 맵 컨테이너 리사이즈 시 Mapbox resize
  useEffect(() => {
    const el = mapRef.current;
    if (!el || !mapboxMapRef.current) return;
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
      const direct = await placeGeocode.reverse(lat, lng);
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
        const r = await placeGeocode.reverse(lat + dLat, lng + dLng);
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
        const r = await placeGeocode.reverse(lat, lng, { zoom: z });
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
    handleLocationClickRef.current = (lat: number, lng: number) => {
      // 1) 즉시 팝업 표시 (체감 지연 제거)
      setClickedLocation({
        lat,
        lng,
        name: 'Loading...',
        address: MAP_PICK_FALLBACK_ADDRESS,
        elevation: null,
        location: { lat, lng },
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
  }, [elevationProvider, resolveNearestAddress]);

  // 주행 마커 이미지 프리로드 → base64 data URL (SVG 내부 참조용, data URI SVG는 외부 URL 로드 불가)
  useEffect(() => {
    if (cyclingMarkerDataUrlRef.current) return;
    fetch(CYCLING_POSITION_MARKER_URL)
      .then((r) => r.blob())
      .then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => { cyclingMarkerDataUrlRef.current = reader.result as string; };
        reader.readAsDataURL(blob);
      })
      .catch(() => { });
  }, []);

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
      !s.explorePickerOpen &&
      !s.routeSlowModalOpen &&
      !s.historyExpanded &&
      s.routeSettingsPanelExpanded &&
      s.routeInputExpanded &&
      (!s.hasRoute || s.elevationExpanded);

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
      if (s.explorePickerOpen) {
        lastAndroidExitPressRef.current = 0;
        setExplorePickerOpen(false);
        return;
      }
      if (s.routeSlowModalOpen) {
        lastAndroidExitPressRef.current = 0;
        setRouteSlowModalOpen(false);
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

  // 탐색된 경로 라인 스타일 유지
  useEffect(() => {
    const map = mapboxMapRef.current;
    if (!map?.getLayer(ROUTE_LAYER)) return;
    map.setPaintProperty(ROUTE_LAYER, 'line-color', '#ff3020');
    map.setPaintProperty(ROUTE_LAYER, 'line-width', 5);
    map.setPaintProperty(ROUTE_LAYER, 'line-opacity', 1);
  }, [route, isMapReady, mapType]);

  // Mapbox 도로 coverage 오버레이 (프로토타입 app.js와 동일한 composite/road 레이어)
  useEffect(() => {
    const map = mapboxMapRef.current;
    if (!map) return;
    try {
      const hasOverlay = !!map.getLayer(ROUTABLE_ROAD_LAYER_ID);
      const hasCompositeSource = !!map.getSource(MAPBOX_COMPOSITE_SOURCE_ID);
      if (!hasOverlay && hasCompositeSource) {
        map.addLayer(
          {
            id: ROUTABLE_ROAD_LAYER_ID,
            type: 'line',
            source: MAPBOX_COMPOSITE_SOURCE_ID,
            'source-layer': 'road',
            filter: [
              'in',
              ['coalesce', ['get', 'class'], ''],
              ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'street', 'street_limited', 'service', 'track', 'path', 'cycleway']],
            ],
            layout: {
              visibility: routeCoverageVisible ? 'visible' : 'none',
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': '#22d3ee',
              'line-opacity': 0.9,
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 13, 2.2, 16, 4],
            },
          },
          map.getLayer(ROUTE_LAYER) ? ROUTE_LAYER : undefined
        );
      } else if (hasOverlay) {
        map.setLayoutProperty(ROUTABLE_ROAD_LAYER_ID, 'visibility', routeCoverageVisible ? 'visible' : 'none');
      }
      if (MAPILLARY_CLIENT_TOKEN && map.getLayer(MAPILLARY_SEQUENCE_LAYER_ID) && map.getLayer(ROUTE_LAYER)) {
        stackMapillaryBelowRoutableRoads(map, ROUTABLE_ROAD_LAYER_ID);
      }
    } catch (e) {
      console.warn('[Mapbox] road coverage overlay', e);
    }
  }, [isMapReady, mapType, routeCoverageVisible]);

  useEffect(() => {
    if (!isMapReady) return;
    applyMap3DState();
  }, [isMapReady, mapType, map3DEnabled, applyMap3DState]);

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
    // 의존성은 route?.path만 사용하고, cachedCoaching 등은 routeRef로 참조 (stale closure 방지)
    const routeData = routeRef.current;
    if (!route?.path?.length || !routeData) return () => clearTimeout(timer);
    const cum = routeCumulativeDistancesM;
    if (!cum?.length) return () => clearTimeout(timer);
    const total = cum[cum.length - 1] ?? 0;
    const along = Math.max(0, Math.min(simulation.alongRouteM ?? 0, total));
    const interp = getLatLngAtDistanceAlongPath(route.path, cum, along);
    const lat = interp.lat;
    const lng = interp.lng;
    const currentIdx = indexAtOrBeforeCumulativeDistance(cum, along);
    const vertexPos = route.path[currentIdx];

    // 방어: path가 sparse이거나 좌표가 없으면 다음 유효한 인덱스로 스킵 (최대 10개까지)
    if (!vertexPos) {
      const maxSkip = Math.min(10, route.path.length - currentIdx - 1);
      for (let skip = 1; skip <= maxSkip; skip++) {
        const nextIdx = currentIdx + skip;
        if (route.path[nextIdx]) {
          const nextAlong = cum[nextIdx] ?? 0;
          console.log(`[SIMULATION_SKIP] sparse path at ${currentIdx}, skipping to ${nextIdx}`);
          setSimulation(prev => ({ ...prev, currentIndex: nextIdx, alongRouteM: nextAlong }));
          return () => clearTimeout(timer);
        }
      }
      console.log('[SIMULATION_STOP] reason=no_valid_position_found');
      setSimulation(prev => ({ ...prev, isActive: false }));
      setAppPhase('IDLE');
      return () => clearTimeout(timer);
    }

    const aheadAlong = Math.min(along + 14, total);
    const aheadInterp = getLatLngAtDistanceAlongPath(route.path, cum, aheadAlong);
    const targetPosForHeading = { lat: aheadInterp.lat, lng: aheadInterp.lng };
    const currentPosForCam = { lat, lng };

    // Sync simulation marker — 누적 거리 기준 세그먼트 보간 (꼭짓점 스냅 아님)
    const map = mapboxMapRef.current;
    let flipHorizontal = false;
    if (aheadAlong > along + 1e-3) {
      try {
        const heading = computeHeading(currentPosForCam, targetPosForHeading);
        flipHorizontal = heading > 180;
      } catch {
        /* ignore */
      }
    }
    const dataUrl = cyclingMarkerDataUrlRef.current;
    const cyclingIconUrl = (() => {
      if (dataUrl) {
        const flip = flipHorizontal ? ' translate(20,20) scale(-1,1) translate(-20,-20)' : '';
        const wobble = '<animateTransform attributeName="transform" type="rotate" values="-3 20 22;3 20 22;-3 20 22" dur="1.2s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>';
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + SIMULATION_MARKER_SIZE_PX + '" height="' + SIMULATION_MARKER_SIZE_PX + '" viewBox="0 0 40 40"><g transform="' + flip + '"><g>' + wobble + '<image href="' + dataUrl.replace(/"/g, "'") + '" x="0" y="0" width="40" height="40" preserveAspectRatio="xMidYMid meet"/></g></g></svg>';
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
      }
      return CYCLING_POSITION_MARKER_URL;
    })();
    const mbGl = mapboxGlRef.current;
    if (!simulationMarker.current && map && mbGl) {
      const el = document.createElement('div');
      el.style.width = `${SIMULATION_MARKER_SIZE_PX}px`;
      el.style.height = `${SIMULATION_MARKER_SIZE_PX}px`;
      el.style.pointerEvents = 'none';
      el.style.zIndex = '1200';
      const img = document.createElement('img');
      img.width = SIMULATION_MARKER_SIZE_PX;
      img.height = SIMULATION_MARKER_SIZE_PX;
      img.alt = '';
      img.src = cyclingIconUrl;
      img.style.display = 'block';
      img.style.width = `${SIMULATION_MARKER_SIZE_PX}px`;
      img.style.height = `${SIMULATION_MARKER_SIZE_PX}px`;
      el.appendChild(img);
      simulationMarker.current = new mbGl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map);
    } else if (simulationMarker.current) {
      simulationMarker.current.setLngLat([lng, lat]);
      const el = simulationMarker.current.getElement();
      el.style.width = `${SIMULATION_MARKER_SIZE_PX}px`;
      el.style.height = `${SIMULATION_MARKER_SIZE_PX}px`;
      el.style.pointerEvents = 'none';
      el.style.zIndex = '1200';
      const img = el.querySelector('img');
      if (img) {
        img.src = cyclingIconUrl;
        img.width = SIMULATION_MARKER_SIZE_PX;
        img.height = SIMULATION_MARKER_SIZE_PX;
        img.style.display = 'block';
        img.style.width = `${SIMULATION_MARKER_SIZE_PX}px`;
        img.style.height = `${SIMULATION_MARKER_SIZE_PX}px`;
      }
    }

    // 일시정지: 마커·맵 중심만 동기화
    if (!simulation.isActive) {
      if (mapboxMapRef.current) {
        mapboxMapRef.current.easeTo({ center: [lng, lat], duration: 0 });
      }
      return;
    }

    // 주행 중: 코칭 등
    setAppPhase('RUNNING');
    if (tempMarker.current) {
      tempMarker.current.remove();
      tempMarker.current = null;
    }
    if (along >= total - 0.35) {
      console.log('[SIMULATION_STOP] reason=end_of_route');
      setSimulation(prev => ({
        ...prev,
        isActive: false,
        alongRouteM: total,
        currentIndex: Math.max(0, route.path.length - 1),
      }));
      setAppPhase('IDLE');
      lastSpokenValidUntilPathIndex.current = null;
      getRideEncouragement(routeData, { distance: routeData.distance, duration: routeData.duration }).then(speak);
      return;
    }

    trackRiderCamera(currentPosForCam, targetPosForHeading, RIDE_CAMERA_TRACK_DURATION_MS);

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
            getPredictiveCoaching(upcomingSlice, pathLen, elevLen, startPathIdx, effectiveSpeedKmHRef.current, coachData?.resistance)
              .then(({ coaching, validUntilPathIndex }) => {
                // 방어: 새 validUntil 이 lastValid 보다 크지 않으면 무한 루프 방지를 위해 append 생략
                if (validUntilPathIndex > lastValid) {
                  setRoute(prev => prev ? { ...prev, cachedCoaching: [...(prev.cachedCoaching || []), { coaching, validUntilPathIndex }] } : null);
                }
              })
              .finally(() => {
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
          try {
            const newCoaching = await getAdvancedCoaching(currentElev, upcoming, effectiveSpeedKmHRef.current, coachData?.resistance);
            setCoachData(newCoaching);
            speak(newCoaching.tip);
          } finally {
            lastCoachedIndex.current = currentIdx;
          }
        })();
      }
      // alongRouteM 변화마다 마커·카메라 보간; 인덱스 진행은 interval 이 alongRouteM 갱신.
    return () => clearTimeout(timer);
  }, [simulation.isActive, simulation.alongRouteM, route?.path, routeCumulativeDistancesM, isMapReady, trackRiderCamera]);

  // Simulation progression: 속도로 누적 거리(m)를 연속 증가 → 마커는 세그먼트 보간으로 끊김 없이 이동
  useEffect(() => {
    if (!simulation.isActive) return;
    if (!route?.path?.length) return;
    const cum = routeCumulativeDistancesM;
    if (!cum?.length) return;
    const path = route.path;
    const total = cum[cum.length - 1] ?? 0;
    if (!Number.isFinite(total) || total <= 0) return;

    let lastTickMs = Date.now();
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

      const deltaM = (effSpeed * 1000 / 3600) * dtSec;

      setSimulation(prev => {
        const base = prev.alongRouteM ?? 0;
        if (base >= total - 1e-9) return prev;
        const nextAlong = Math.min(base + deltaM, total);
        const idx = indexAtOrBeforeCumulativeDistance(cum, nextAlong);
        if (nextAlong === base && idx === prev.currentIndex) return prev;
        return { ...prev, alongRouteM: nextAlong, currentIndex: idx };
      });
    }, SIMULATION_PROGRESS_TICK_MS);
    return () => clearInterval(interval);
  }, [simulation.isActive, route?.path, routeCumulativeDistancesM]);

  // 주행 중: 경로상 위치에 Mapillary 이미지가 있으면 임베드 플로팅 패널 표시
  // 주의: simulation.currentIndex 를 deps 에 두면 ~33ms 마다 effect cleanup 이 fetch 를 abort 하므로
  // 최신 인덱스는 simulationIndexForStreetRef + 짧은 interval 로만 반영한다.
  useEffect(() => {
    if (!mapillaryTokenConfigured || !route?.path?.length) {
      resetRideMapillaryStreetState();
      return;
    }
    if (!simulation.isActive) {
      return;
    }
    const path = route.path;
    const chunks = mapillaryStreetDensePathChunks;
    const ac = new AbortController();

    const tryFetch = () => {
      const idx = Math.min(Math.max(0, simulationIndexForStreetRef.current), path.length - 1);
      const p = path[idx];
      if (!p) return;
      const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
      const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const now = Date.now();
      const anchor = lastMapillaryStreetAnchorRef.current;
      const movedM = anchor ? computeDistanceBetween({ lat, lng }, anchor) : Infinity;
      const timeSince = lastMapillaryStreetFetchAtRef.current ? now - lastMapillaryStreetFetchAtRef.current : Infinity;
      const shouldFetch = movedM >= MAPILLARY_STREET_FETCH_MIN_MOVE_M || timeSince >= MAPILLARY_STREET_FETCH_THROTTLE_MS;
      if (!shouldFetch) return;

      if (movedM >= 130) {
        lastMapillaryStreetDismissedKeyRef.current = null;
        lastMapillaryStreetPickRef.current = null;
      }

      lastMapillaryStreetFetchAtRef.current = now;
      lastMapillaryStreetAnchorRef.current = { lat, lng };

      const gen = ++mapillaryStreetFetchGenRef.current;
      void (async () => {
        try {
          const queryPath = chunks?.densePath ?? path;
          const queryIdx = chunks
            ? indexAtOrBeforeCumulativeDistance(
                chunks.cumDense,
                chunks.cumSparse[Math.min(idx, chunks.cumSparse.length - 1)] ?? 0
              )
            : idx;
          const rows = await queryMapillaryAlongPathSamples(
            MAPILLARY_CLIENT_TOKEN,
            queryPath,
            queryIdx,
            [...MAPILLARY_STREET_LOOKAHEAD_SAMPLES_DENSE_M],
            { signal: ac.signal, speedKmH: effectiveSpeedKmHRef.current }
          );
          if (gen !== mapillaryStreetFetchGenRef.current) return;
          const dismissed = lastMapillaryStreetDismissedKeyRef.current;
          const chosenPick = chooseMapillaryPickAlongPath(rows, {
            dismissedId: dismissed,
            prevPick: lastMapillaryStreetPickRef.current,
            maxGpsJumpM: MAPILLARY_STREET_MAX_GPS_JUMP_M,
            riderLatLng: { lat, lng },
            stalePrevRiderDistM: 70,
          });
          const chosenKey = chosenPick?.id ?? null;
          const chosenIsPano = chosenPick?.isPano === true;
          if (!chosenKey || !chosenPick) {
            const anyHit = rows.some((r) => r.pick);
            if (!anyHit) lastMapillaryStreetDismissedKeyRef.current = null;
            setRideMapillaryStreet((prev) => {
              if (!prev) return null;
              const visibleMs = Date.now() - prev.shownAtMs;
              return visibleMs >= MAPILLARY_STREET_NO_HIT_GRACE_MS ? null : prev;
            });
            return;
          }
          const prevStreet = rideMapillaryStreetRef.current;
          const prevVisibleMs = prevStreet ? Date.now() - prevStreet.shownAtMs : Infinity;
          const holdBlocksNewFrame =
            !!prevStreet &&
            prevStreet.imageKey !== chosenKey &&
            prevVisibleMs < MAPILLARY_STREET_MIN_HOLD_MS;

          setRideMapillaryStreet((prev) => {
            const visibleMs = prev ? Date.now() - prev.shownAtMs : Infinity;
            if (prev?.imageKey === chosenKey) return prev;
            if (prev && visibleMs < MAPILLARY_STREET_MIN_HOLD_MS) return prev;
            return { imageKey: chosenKey, shownAtMs: Date.now(), isPano: chosenIsPano };
          });

          if (!holdBlocksNewFrame) {
            lastMapillaryStreetPickRef.current = {
              id: chosenPick.id,
              lat: chosenPick.lat,
              lng: chosenPick.lng,
              sequenceId: chosenPick.sequenceId,
            };
          }
        } catch {
          if (gen !== mapillaryStreetFetchGenRef.current) return;
        }
      })();
    };

    tryFetch();
    const pollMs = Math.min(400, Math.max(120, Math.floor(MAPILLARY_STREET_FETCH_THROTTLE_MS / 2)));
    const intervalId = window.setInterval(tryFetch, pollMs);

    return () => {
      clearInterval(intervalId);
      ac.abort();
    };
  }, [mapillaryTokenConfigured, simulation.isActive, route?.path, mapillaryStreetDensePathChunks, resetRideMapillaryStreetState]);

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
        await run('en-US');
      } catch (e) {
        console.warn(`[SpeechGuard] native fallback failed (${reason}, en-US)`, e);
        try {
          if (speechRequestIdRef.current !== requestId) return;
          await run('ko-KR');
        } catch (e2) {
          console.warn(`[SpeechGuard] native fallback failed (${reason}, ko-KR)`, e2);
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
      };
      utterance.onerror = (e) => {
        if (speechRequestIdRef.current !== requestId) return;
        console.warn('[SpeechGuard] web speech error', e);
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
    }
  }, [coachingOn, safeSpeechCancel]);

  // Speech Synthesis voices 로드 촉진 (Chrome 등에서 getVoices()가 초기에 빈 배열인 문제 완화)
  useEffect(() => {
    const synth = getSpeechSynthesisSafe();
    if (!synth || typeof synth.addEventListener !== 'function' || typeof synth.removeEventListener !== 'function') return;
    const onVoicesChanged = () => { synth.getVoices(); };
    synth.addEventListener('voiceschanged', onVoicesChanged);
    onVoicesChanged();
    return () => synth.removeEventListener('voiceschanged', onVoicesChanged);
  }, []);

  const createCustomMarker = (latLng: any, label: string, color: string): MapboxMarker => {
    const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
    const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
    const mb = mapboxGlRef.current;
    const map = mapboxMapRef.current;
    if (!mb || !map) throw new Error('Map not ready');
    const el = document.createElement('div');
    el.style.width = '28px';
    el.style.height = '28px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = color;
    el.style.border = '2px solid white';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.color = 'white';
    el.style.fontWeight = 'bold';
    el.style.fontSize = '14px';
    el.style.boxSizing = 'border-box';
    const span = document.createElement('span');
    span.setAttribute('data-m-label', '1');
    span.textContent = label;
    el.appendChild(span);
    const marker = new mb.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    mapMarkersRef.current.push(marker);
    return marker;
  };

  /** 저장된 payload 로 경로 복원.
   *  v2 (USE_OFFLINE_ROUTE_RESTORE=true): OSRM/Elevation 재호출 없이 densifiedGeometry + elevationSamples 사용 → 네트워크 없어도 주행 가능.
   *  v1 또는 오프라인 복원 실패: Open-Elevation 재요청 후 self-heal (payload v2 로 승격).
   *  경로 복원만 수행한다(네트워크 표고 재요청 등은 선택적).
   */
  const restoreRouteFromSavedGeometry = useCallback(async (saved: SavedRoute) => {
    const payload = saved.routePayload;
    if (!payload?.fullGeometry?.length) return;
    setLoading(true);
    try {
      const canOffline = USE_OFFLINE_ROUTE_RESTORE && isOfflineRestorablePayload(payload);

      // 1) densifiedGeometry 결정 — v2 이면 저장된 것, 아니면 fullGeometry 를 즉석 densify
      const densifiedLatLng: [number, number][] = canOffline && payload.densifiedGeometry?.length
        ? payload.densifiedGeometry
        : densifyLatLngPath(payload.fullGeometry, ROUTE_RENDER_DENSIFY_INTERVAL_M);
      const path = densifiedLatLng.map(([lat, lng]) => ({ lat, lng }));
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
            location: { lat, lng },
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

      // 3) 마커·경로 라인 동기 재구성
      const oldMarkers = [startMarker.current, endMarker.current, ...waypointMarkers.current].filter(Boolean);
      oldMarkers.forEach((m) => m?.remove());
      mapMarkersRef.current = mapMarkersRef.current.filter((m) => !oldMarkers.includes(m));
      startMarker.current = null;
      endMarker.current = null;
      waypointMarkers.current = [];
      const originSeed = payload.originLatLng
        ? { lat: payload.originLatLng[0], lng: payload.originLatLng[1] }
        : path[0];
      const destSeed = payload.destLatLng
        ? { lat: payload.destLatLng[0], lng: payload.destLatLng[1] }
        : path[path.length - 1];
      startMarker.current = createCustomMarker(path[0], 'A', '#3b82f6');
      endMarker.current = createCustomMarker(path[path.length - 1], 'B', '#ef4444');
      saved.waypoints.forEach((wp, idx) => {
        waypointMarkers.current.push(createCustomMarker({ lat: wp.lat, lng: wp.lng }, (idx + 1).toString(), '#f59e0b'));
      });
      routeLinePathRef.current = path;
      const mmap = mapboxMapRef.current;
      if (mmap) {
        ensureRouteLineLayer(mmap);
        setRouteLineGeometry(mmap, path);
      }

      // 저장된 OSRM duration 문자열은 빌드 시 엔진 ETA일 수 있음 → 앱 기준(거리÷사용자 평균 속도)으로 통일
      let restoreTotalM = payload.totalDistanceMeters;
      if (restoreTotalM == null || !Number.isFinite(restoreTotalM) || restoreTotalM <= 0) {
        if (payload.cumulativeDistances?.length) {
          restoreTotalM = payload.cumulativeDistances[payload.cumulativeDistances.length - 1] ?? 0;
        } else {
          const cum = computeCumulativeDistances(densifiedLatLng);
          restoreTotalM = cum[cum.length - 1] ?? 0;
        }
      }
      const restoreDurationText = formatDurationSimpleFromMetersAndSpeed(restoreTotalM, speedKmH, payload.distance);

      // 4) 상태 동기 세팅 — 여기까지가 네트워크 없이 주행 가능한 상태
      const modeBySavedProfile = modeFromProfile(payload.profile);
      setMode(modeBySavedProfile);
      setLockedRouteProfile(payload.profile);
      setRoute({
        origin: saved.origin,
        destination: saved.destination,
        distance: payload.distance,
        duration: restoreDurationText,
        path,
        elevation: elevationResults,
        ...(restoreTotalM > 0 ? { totalDistanceMeters: restoreTotalM } : {}),
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
      resetRideMapillaryStreetState();
      setSimulation({ isActive: false, currentIndex: 0, alongRouteM: 0, speed: 100 });
      setAppPhase('IDLE');
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
      if (mmap && path.length > 0) fitMapToPath(mmap, path);

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
                location: { lat: r.latitude, lng: r.longitude },
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
              duration: formatDurationSimpleFromMetersAndSpeed(totalM, speedKmH, payload.distance),
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

    } catch (e) {
      console.error('[RESTORE_FAIL] falling back to OSRM recalculation', e);
      // 오프라인 복원 실패 — 세션 내에서만 calculateRoute 로 폴백(localStorage 는 건드리지 않음).
      // 호출자(handleLoadFavorite)가 실패를 인지할 수 있도록 에러를 올린다.
      throw e;
    } finally {
      setLoading(false);
    }
  }, [elevationProvider, elevationEngine, speedKmH, updateFavoriteRoutePayload, resetRideMapillaryStreetState]);

  useEffect(() => {
    restoreRouteFromSavedGeometryRef.current = restoreRouteFromSavedGeometry;
  }, [restoreRouteFromSavedGeometry]);

  /** 평균 속도 슬라이더 변경 시: 저장/복원·OSRM 경로 모두 동일 공식(거리÷speedKmH)으로 ETA 문자열만 갱신 */
  useEffect(() => {
    setRoute((prev) => {
      if (!prev) return prev;
      const m = prev.totalDistanceMeters;
      if (m == null || !Number.isFinite(m) || m <= 0) return prev;
      if (!speedKmH || speedKmH <= 0) return prev;
      const next = formatDurationSimpleFromMetersAndSpeed(m, speedKmH, prev.distance);
      if (prev.duration === next) return prev;
      return { ...prev, duration: next };
    });
  }, [speedKmH, trackRiderCamera]);

  const clearMapOverlays = () => {
    resetRideMapillaryStreetState();
    setLockedRouteProfile(null);
    hasShownModePulseRef.current = false;
    setAppPhase('IDLE');
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
    routeLinePathRef.current = [];
    const mmapClear = mapboxMapRef.current;
    if (mmapClear) clearRouteLineGeometry(mmapClear);
    mapMarkersRef.current.forEach((m) => m.remove());
    mapMarkersRef.current = [];
    if (simulationMarker.current) {
      simulationMarker.current.remove();
      simulationMarker.current = null;
    }
    startMarker.current = null;
    endMarker.current = null;
    waypointMarkers.current = [];
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
      searchMarkerRef.current = null;
    }
    setRoute(null);
    lastRouteRequestRef.current = null;
    console.log('[SIMULATION_STOP] reason=clear_map');
    setRideRearCameraFollow(true);
    setSimulation({ isActive: false, currentIndex: 0, alongRouteM: 0, speed: 100 });
    setCoachData(null);
    setRouteSource(null);
    setWaypoints([]);

    // Explicitly clear start and end inputs
    setOrigin('');
    setDestination('');

    // Clear Coordinate Refs
    originLocationRef.current = null;
    destLocationRef.current = null;

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
      setSimulation(prev => ({ ...prev, currentIndex: 0, alongRouteM: 0, isActive: true }));
      lastCoachedIndex.current = -1;
      lastSpokenValidUntilPathIndex.current = null;
      setElapsedTime(0);
      setCoveredDistance(0);
      setAverageRpm(0);
      rpmSampleSumRef.current = 0;
      rpmSampleCountRef.current = 0;
      trackRiderCamera(route.path[0], route.path[1], 450);

      getCourseBriefing(route).then(speak);
    }
  };

  const handleStopSimulation = () => {
    console.log('[SIMULATION_STOP] reason=user_stop');
    resetRideMapillaryStreetState();
    setRideRearCameraFollow(true);
    setRewardOfferModalStage(null);
    setRewardOfferTargetKm(0);
    setRideLimitMessage(null);
    setMaxRideLimitMessage(null);
      setSimulation(prev => ({ ...prev, isActive: false, currentIndex: 0, alongRouteM: 0 }));
    setAppPhase('IDLE');
    lastValidUntilFetched.current = -1;
    isPrefetchingCoachRef.current = false;
    lastCoachSpeakAtMsRef.current = 0;
    lastSpokenResistanceRef.current = null;
    lastSpokenTipIndexRef.current = null;

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
      if (isActive && route?.path?.length) {
        const path = route.path;
        const cd =
          route.cumulativeDistances?.length === path.length
            ? route.cumulativeDistances
            : computeCumulativeDistances(path.map((p: any) => [fix8(coordLat(p)), fix8(coordLng(p))] as [number, number]));
        const total = cd[cd.length - 1] ?? 0;
        const along = Math.max(0, Math.min(prev.alongRouteM ?? cd[prev.currentIndex] ?? 0, total));
        const cur = getLatLngAtDistanceAlongPath(path, cd, along);
        const ahead = getLatLngAtDistanceAlongPath(path, cd, Math.min(along + 14, total));
        trackRiderCamera({ lat: cur.lat, lng: cur.lng }, { lat: ahead.lat, lng: ahead.lng }, 450);
      }
      return { ...prev, isActive };
    });
  };

  /** 주행 위치 강제 이동: 시뮬 타이머/경로는 유지하고 누적 거리·인덱스 동기화. 맵/마커는 기존 effect가 보간 위치로 맞춤. */
  const jumpToRouteIndex = (targetIndex: number) => {
    if (!route?.path?.length) return;
    const clamped = Math.max(0, Math.min(targetIndex, route.path.length - 1));
    const cum =
      route.cumulativeDistances?.length === route.path.length
        ? route.cumulativeDistances
        : computeCumulativeDistances(route.path.map((p: any) => [fix8(coordLat(p)), fix8(coordLng(p))] as [number, number]));
    const along = cum[clamped] ?? 0;
    setSimulation(prev => ({ ...prev, currentIndex: clamped, alongRouteM: along }));
    const coord = route.path[clamped];
    const lat = typeof coord.lat === 'function' ? coord.lat() : coord.lat;
    const lng = typeof coord.lng === 'function' ? coord.lng() : coord.lng;
    mapboxMapRef.current?.easeTo({ center: [lng, lat], duration: 0 });
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


    routeCalcSessionRef.current += 1;
    const calcSession = routeCalcSessionRef.current;
    routeCalcActiveRef.current = true;
    routePhaseDoneRef.current = false;
    elevationPhaseDoneRef.current = false;
    accumulatedSlowModalMsRef.current = 0;
    slowModalVisibleSinceRef.current = null;
    setRouteSlowModalOpen(false);
    if (routeSlowModalTimer1Ref.current) {
      clearTimeout(routeSlowModalTimer1Ref.current);
      routeSlowModalTimer1Ref.current = null;
    }
    if (routeSlowModalTimer2Ref.current) {
      clearTimeout(routeSlowModalTimer2Ref.current);
      routeSlowModalTimer2Ref.current = null;
    }
    routeSlowModalTimer1Ref.current = window.setTimeout(() => {
      if (routeCalcSessionRef.current !== calcSession || !routeCalcActiveRef.current) return;
      if (routePhaseDoneRef.current) return;
      if (slowModalVisibleSinceRef.current == null) {
        slowModalVisibleSinceRef.current = performance.now();
      }
      setRouteSlowModalOpen(true);
    }, ROUTE_PHASE_SLOW_MODAL_MS);
    setLoading(true);
    setCoachData(null);
    setRouteSource(null);
    setElapsedTime(0);
    setCoveredDistance(0);
    setAverageRpm(0);
    rpmSampleSumRef.current = 0;
    rpmSampleCountRef.current = 0;
    lastCoachedIndex.current = -1;
    routeLinePathRef.current = [];
    const mmapPre = mapboxMapRef.current;
    if (mmapPre) clearRouteLineGeometry(mmapPre);
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
          if (typeof routingPoint.lat === 'function' && typeof routingPoint.lng === 'function') {
            return { lat: routingPoint.lat(), lng: routingPoint.lng() };
          }
          return { lat: routingPoint.lat, lng: routingPoint.lng };
        }
        const trimmed = String(addressFallback || '').trim();
        if (!trimmed) {
          throw new Error(`[OSRM] ${which}: 고정 좌표 없고 주소도 비어 있음`);
        }
        const res = await placeGeocode.addressToCoord(trimmed);
        return { lat: res.lat, lng: res.lng };
      };
      const toLatLng = (p: any) => {
        if (!p) return null;
        if (typeof p.lat === 'function' && typeof p.lng === 'function') return { lat: p.lat(), lng: p.lng() };
        const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
        const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
        if (lat != null && lng != null) return { lat: Number(lat), lng: Number(lng) };
        return null;
      };

      let path: any[] = [];
      let distText = '';
      let durText = '';
      /** OSRM 응답 거리(m). ETA·totalDistanceMeters 는 사용자 속도 기준이라 동일 필드로 맞춘다. */
      let osrmRouteLengthMeters = 0;
      let originLatLngOuter: any = null;
      let destLatLngOuter: any = null;
      try {
        const originLatLng = await getCoord(originRoutingPoint, finalOrigin, 'origin');
        const destLatLng = await getCoord(destRoutingPoint, finalDestination, 'destination');
        originLatLngOuter = originLatLng;
        destLatLngOuter = destLatLng;
        const wpLatLngs = activeWaypoints.map(wp => toLatLng(wp.location)).filter(Boolean) as any[];
        const profile = activeMode === TravelMode.DRIVING ? 'driving' : activeMode === TravelMode.BICYCLING ? 'cycling' : 'foot';
        const rawChain: Array<{ lat: number; lng: number }> = [originLatLng, ...wpLatLngs, destLatLng];
        const coordsStrFrom = (pts: Array<{ lat: number; lng: number }>) =>
          pts.map((p) => `${coordLng(p)},${coordLat(p)}`).join(';');
        const origCoordsStr = coordsStrFrom(rawChain);

        const fetchOsrmData = async (coordStr: string) =>
          Capacitor.isNativePlatform()
            ? fetchOsrmRouteJson(profile, coordStr)
            : (await fetch(`/api/osrm-route?profile=${encodeURIComponent(profile)}&coords=${encodeURIComponent(coordStr)}`)).json();

        let data: OsrmRouteResponse;
        if (MAPILLARY_CLIENT_TOKEN.trim()) {
          let mlyChain = rawChain;
          try {
            mlyChain = await snapRoutingChainToMapillaryParallel(MAPILLARY_CLIENT_TOKEN, rawChain, {
              coverage: {
                osrmCoverage: routeCoverageVisibleRef.current,
                mapillaryBasic: mapillaryBasicCoverageVisibleRef.current,
                mapillaryPano360: mapillaryPanoCoverageVisibleRef.current,
              },
            });
          } catch {
            mlyChain = rawChain;
          }
          const mlyCoordsStr = coordsStrFrom(mlyChain);
          const unchanged =
            mlyCoordsStr === origCoordsStr ||
            mlyChain.every((p, i) => p.lat === rawChain[i]!.lat && p.lng === rawChain[i]!.lng);
          data = await fetchOsrmData(mlyCoordsStr);
          if (data.code !== 'Ok' && !unchanged) {
            data = await fetchOsrmData(origCoordsStr);
          }
        } else {
          data = await fetchOsrmData(origCoordsStr);
        }
        if (data.code !== 'Ok') {
          const errText = typeof (data as { error?: string }).error === 'string' ? (data as { error?: string }).error : '';
          if (data.code === 'NoSegment') {
            alert(
              errText ||
                'Could not find a routable road near your selected points (within 300 m). Try moving the start, end, or waypoints closer to a mapped road.'
            );
          } else {
            alert(errText || `Route could not be computed. (${data.code ?? 'Error'})`);
          }
          setLoading(false);
          return;
        }
        if (data.code === 'Ok') {
          const osrmMeta = (data as { _meta?: { osrmSnapRelaxed?: boolean } })._meta;
          if (osrmMeta?.osrmSnapRelaxed) {
            alert(
              'No routable road within 100 m of a point. The search radius was widened to 300 m and a route was found. The path may start slightly farther from where you tapped.'
            );
          }
          const decoded = decodePath(data.routes[0].geometry);
          lastOsrmDecodedPathRef.current = decoded.map(([lat, lng]) => [fix8(lat), fix8(lng)] as [number, number]);
          path = decoded.map(([lat, lng]) => ({ lat, lng }));
          const routeLengthM = data.routes[0].distance;
          osrmRouteLengthMeters = routeLengthM;
          distText = `${(routeLengthM / 1000).toFixed(1)} km`;
          // Route settings ETA: distance ÷ user average speed (speedKmH). Cycling-app assumption — not OSRM engine duration, not grade-adjusted simulation.
          durText = formatDurationSimple(routeLengthM / (speedKmH * 1000 / 3600));
          setRouteSource('OSRM');
          if (mapboxMapRef.current && path.length) fitMapToPath(mapboxMapRef.current, path);
        }
      } catch (e) {
        console.error('[OSRM_ERROR]', e);
        setLoading(false);
        return;
      } finally {
        routePhaseDoneRef.current = true;
        if (routeSlowModalTimer1Ref.current) {
          clearTimeout(routeSlowModalTimer1Ref.current);
          routeSlowModalTimer1Ref.current = null;
        }
        if (path.length === 0) {
          elevationPhaseDoneRef.current = true;
        }
      }
      if (path.length > 0) {
        if (routeSlowModalTimer2Ref.current) {
          clearTimeout(routeSlowModalTimer2Ref.current);
          routeSlowModalTimer2Ref.current = null;
        }
        routeSlowModalTimer2Ref.current = window.setTimeout(() => {
          if (routeCalcSessionRef.current !== calcSession || !routeCalcActiveRef.current) return;
          if (elevationPhaseDoneRef.current) return;
          if (slowModalVisibleSinceRef.current == null) {
            slowModalVisibleSinceRef.current = performance.now();
          }
          setRouteSlowModalOpen(true);
        }, ELEVATION_PHASE_SLOW_MODAL_MS);

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
        const tElev0 = performance.now();
        try {
          const samples = openElevation.elevationSamplesForPath(path.length);
          const openRes = await fetchElevationAlongOsrmPath(path, samples, activeMode);
          const smoothed = openElevation.smoothElevations(openRes.results.map((r) => r.elevation));
          elevationRes = {
            results: applyRoadElevationModel(
              openRes.results.map((r, i) => ({
                elevation: smoothed[i] ?? r.elevation,
                location: { lat: r.latitude, lng: r.longitude },
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
        } finally {
          elevationPhaseDoneRef.current = true;
          if (routeSlowModalTimer2Ref.current) {
            clearTimeout(routeSlowModalTimer2Ref.current);
            routeSlowModalTimer2Ref.current = null;
          }
        }

        const osrmPairs: [number, number][] = path.map((p: any) => [fix8(coordLat(p)), fix8(coordLng(p))] as [number, number]);
        const densifiedPairs = densifyPolylineFixedIntervalM(osrmPairs, ROUTE_RENDER_DENSIFY_INTERVAL_M);
        const densifiedPath = densifiedPairs.map(([lat, lng]) => ({ lat, lng }));
        const oldMarkers = [startMarker.current, endMarker.current, ...waypointMarkers.current].filter(Boolean);
        oldMarkers.forEach((m) => m.remove());
        mapMarkersRef.current = mapMarkersRef.current.filter((m) => !oldMarkers.includes(m));
        startMarker.current = null;
        endMarker.current = null;
        waypointMarkers.current = [];
        startMarker.current = createCustomMarker(densifiedPath[0], 'A', '#3b82f6');
        endMarker.current = createCustomMarker(densifiedPath[densifiedPath.length - 1], 'B', '#ef4444');
        activeWaypoints.forEach((wp, idx) => {
          waypointMarkers.current.push(createCustomMarker(wp.location, (idx + 1).toString(), '#f59e0b'));
        });
        routeLinePathRef.current = densifiedPath;
        const mmapRoute = mapboxMapRef.current;
        if (mmapRoute) {
          ensureRouteLineLayer(mmapRoute);
          setRouteLineGeometry(mmapRoute, densifiedPath);
        }
        setRoute({
          origin: finalOrigin,
          destination: finalDestination,
          distance: distText,
          duration: durText,
          path: densifiedPath,
          elevation: elevationRes.results ?? [],
          ...(osrmRouteLengthMeters > 0 ? { totalDistanceMeters: Number(osrmRouteLengthMeters.toFixed(2)) } : {})
        });
        if (hydrateFavoriteId && densifiedPath.length > 0) {
          const densifiedLatLng: [number, number][] = densifiedPath.map((p: any) => [fix8(coordLat(p)), fix8(coordLng(p))]);
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

        // 새 path 설정 직후 시뮬레이션 리셋
        console.log('[SIMULATION_STOP] reason=route_recalculated');
        resetRideMapillaryStreetState();
        setSimulation({ isActive: false, currentIndex: 0, alongRouteM: 0, speed: 100 });
        setAppPhase('IDLE');
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

        if (autoStart) {
          countdownDoneRef.current = async () => {
            const r = routeRef.current;
            if (r) await startSimulationOnly(r);
          };
          setCountdown(3);
        }
      }
    } catch (err) {
      console.error('[CALCULATE_ROUTE_FINAL_ERROR]', {
        timestamp: new Date().toISOString(),
        origin: finalOrigin.substring(0, 50),
        destination: finalDestination.substring(0, 50),
        error: err instanceof Error ? err.message : String(err)
      });
      alert('Could not compute the route. Please try again.');
    } finally {
      if (slowModalVisibleSinceRef.current != null) {
        accumulatedSlowModalMsRef.current += performance.now() - slowModalVisibleSinceRef.current;
        slowModalVisibleSinceRef.current = null;
      }
      setRouteSlowModalOpen(false);
      if (routeSlowModalTimer1Ref.current) {
        clearTimeout(routeSlowModalTimer1Ref.current);
        routeSlowModalTimer1Ref.current = null;
      }
      if (routeSlowModalTimer2Ref.current) {
        clearTimeout(routeSlowModalTimer2Ref.current);
        routeSlowModalTimer2Ref.current = null;
      }
      routeCalcActiveRef.current = false;
      setLoading(false);
    }
  }, [origin, destination, waypoints, mode, speedKmH, elevationEngine, elevationProvider, updateFavoriteRoutePayload, showElevationFlatToast, resetRideMapillaryStreetState]);

  /** Core: actually starts ride (coaching, timers). Reward logic calls this. */
  const startSimulationCore = useCallback(async (currentRoute: RouteInfo) => {
    setRideLimitMessage(null);
    setMaxRideLimitMessage(null);
    setRewardOfferModalStage(null);

    setElapsedTime(0);
    setCoveredDistance(0);
    // 이전 ride 의 coachData 가 isActive=true 전환 직후 잠깐 표시되는 문제 방지.
    // 새 coachData 는 getPredictiveCoaching 완료 후 아래에서 세팅된다.
    setCoachData(null);
    // 이전 ride 의 캐시된 코칭이 새 세그먼트에 섞여 들어오지 않도록 비움.
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

    // 첫 코칭 발화/음악 루프 등 ref 기반 로직이 React state effect 를 기다리지 않게 즉시 반영한다.
    simulationActiveRef.current = true;
    setSimulation({ isActive: true, currentIndex: 0, alongRouteM: 0, speed: 100 });
    setAppPhase('RUNNING');
    trackRiderCamera(currentRoute.path[0], currentRoute.path[1], 450);

    const elevLen = currentRoute.elevation.length;
    const segmentSize = Math.min(20, elevLen);
    const upcomingSlice = currentRoute.elevation.slice(0, segmentSize);
    if (upcomingSlice.length > 0) {
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
    }
    lastCoachedIndex.current = 0;
  }, [speedKmH]);

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
    const r = routeRef.current;
    if (r?.path?.length) {
      const path = r.path;
      const cd =
        r.cumulativeDistances?.length === path.length
          ? r.cumulativeDistances
          : computeCumulativeDistances(path.map((p: any) => [fix8(coordLat(p)), fix8(coordLng(p))] as [number, number]));
      const total = cd[cd.length - 1] ?? 0;
      const along = Math.max(0, Math.min(simulation.alongRouteM ?? 0, total));
      const cur = getLatLngAtDistanceAlongPath(path, cd, along);
      const ahead = getLatLngAtDistanceAlongPath(path, cd, Math.min(along + 14, total));
      trackRiderCamera({ lat: cur.lat, lng: cur.lng }, { lat: ahead.lat, lng: ahead.lng }, 450);
    }
  }, [grantRideExtensionFromRewardedAd, simulation.alongRouteM, trackRiderCamera]);

  const handleRewardDeclineSecond = useCallback(() => {
    setRewardOfferModalStage(null);
    rewardSecondDeclinedRef.current = true;
    setAppPhase('RUNNING');
    setSimulation(prev => ({ ...prev, isActive: true }));
    const r = routeRef.current;
    if (r?.path?.length) {
      const path = r.path;
      const cd =
        r.cumulativeDistances?.length === path.length
          ? r.cumulativeDistances
          : computeCumulativeDistances(path.map((p: any) => [fix8(coordLat(p)), fix8(coordLng(p))] as [number, number]));
      const total = cd[cd.length - 1] ?? 0;
      const along = Math.max(0, Math.min(simulation.alongRouteM ?? 0, total));
      const cur = getLatLngAtDistanceAlongPath(path, cd, along);
      const ahead = getLatLngAtDistanceAlongPath(path, cd, Math.min(along + 14, total));
      trackRiderCamera({ lat: cur.lat, lng: cur.lng }, { lat: ahead.lat, lng: ahead.lng }, 450);
    }
  }, [simulation.alongRouteM, trackRiderCamera]);

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

      if (startMarker.current) {
        startMarker.current.remove();
        mapMarkersRef.current = mapMarkersRef.current.filter((m) => m !== startMarker.current);
      }
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

      if (endMarker.current) {
        endMarker.current.remove();
        mapMarkersRef.current = mapMarkersRef.current.filter((m) => m !== endMarker.current);
      }
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
      waypointMarkers.current[idx].remove();
      mapMarkersRef.current = mapMarkersRef.current.filter((m) => m !== waypointMarkers.current[idx]);
      waypointMarkers.current.splice(idx, 1);
      // 남은 웨이포인트 마커 라벨을 1, 2, … 로 재정렬
      waypointMarkers.current.forEach((m, i) => {
        const labelEl = m.getElement().querySelector('[data-m-label]');
        if (labelEl) labelEl.textContent = String(i + 1);
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
      startMarker.current.remove();
      mapMarkersRef.current = mapMarkersRef.current.filter((m) => m !== startMarker.current);
      startMarker.current = null;
    }
  };

  const handleRemoveEnd = () => {
    setDestination('');
    destLocationRef.current = null;
    setDestinationSuggestions([]);
    setShowDestinationSuggestions(false);
    if (endMarker.current) {
      endMarker.current.remove();
      mapMarkersRef.current = mapMarkersRef.current.filter((m) => m !== endMarker.current);
      endMarker.current = null;
    }
  };

  const clearPlaceSearchMarker = () => {
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
      mapMarkersRef.current = mapMarkersRef.current.filter((m) => m !== searchMarkerRef.current);
      searchMarkerRef.current = null;
    }
  };

  const applyPlaceSearchOnMap = (lat: number, lng: number, recentLabel: string) => {
    const map = mapboxMapRef.current;
    const mb = mapboxGlRef.current;
    if (!map || !mb) return;
    map.jumpTo({ center: [lng, lat], zoom: 16 });
    clearPlaceSearchMarker();
    const el = document.createElement('div');
    el.style.width = '28px';
    el.style.height = '28px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#22c55e';
    el.style.border = '2px solid white';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.color = 'white';
    el.style.fontWeight = 'bold';
    el.style.fontSize = '12px';
    el.style.cursor = 'pointer';
    const span = document.createElement('span');
    span.setAttribute('data-m-label', '1');
    span.textContent = 'P';
    el.appendChild(span);
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      clearPlaceSearchMarker();
    });
    searchMarkerRef.current = new mb.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    mapMarkersRef.current.push(searchMarkerRef.current);
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
    if (!query) return;
    setShowPlaceSearchSuggestions(false);
    setPlaceSearchHighlightIndex(-1);
    try {
      const res = await placeGeocode.search(query);
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

  const applyMapStyle = (next: 'streets' | 'outdoors' | 'satellite' | 'hybrid') => {
    setMapType(next);
    const mmap = mapboxMapRef.current;
    if (mmap) mmap.setStyle(mapStyleUrl(next));
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

  const UI_TOGGLE_DEBOUNCE_MS = 400;
  const toggleRouteCoverageVisibleUi = useCallback(() => {
    const n = Date.now();
    if (n - lastRouteCoverageUiToggleMsRef.current < UI_TOGGLE_DEBOUNCE_MS) return;
    lastRouteCoverageUiToggleMsRef.current = n;
    setRouteCoverageVisible((v) => !v);
  }, []);
  const toggleMapillaryBasicCoverageVisibleUi = useCallback(() => {
    if (!mapillaryTokenConfigured) return;
    const n = Date.now();
    if (n - lastMapillaryBasicUiToggleMsRef.current < UI_TOGGLE_DEBOUNCE_MS) return;
    lastMapillaryBasicUiToggleMsRef.current = n;
    setMapillaryBasicCoverageVisible((v) => !v);
  }, [mapillaryTokenConfigured]);
  const toggleMapillaryPanoCoverageVisibleUi = useCallback(() => {
    if (!mapillaryTokenConfigured) return;
    const n = Date.now();
    if (n - lastMapillaryPanoUiToggleMsRef.current < UI_TOGGLE_DEBOUNCE_MS) return;
    lastMapillaryPanoUiToggleMsRef.current = n;
    setMapillaryPanoCoverageVisible((v) => !v);
  }, [mapillaryTokenConfigured]);

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
      {mapBootstrapError && (
        <div
          className="fixed left-0 right-0 z-[9998] mx-2 rounded-xl px-3 py-2.5 bg-amber-950/95 text-amber-50 text-[12px] font-medium leading-snug shadow-xl flex items-start gap-2 border border-amber-800/60"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
          role="alert"
        >
          <span className="flex-1 min-w-0">{mapBootstrapError}</span>
          <button
            type="button"
            className="shrink-0 text-amber-200 underline text-[11px] px-1"
            onClick={() => setMapBootstrapError(null)}
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

      {routeSlowModalOpen && (
        <div className="absolute inset-0 z-[1998] flex items-center justify-center bg-black/55 backdrop-blur-sm p-3">
          <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-2xl p-4 w-[92%] max-w-[420px]">
            <div className="text-slate-900 font-extrabold text-[15px] leading-snug">Route search is taking longer than usual.</div>
            <p className="text-slate-600 text-[12px] mt-2 leading-snug">
              Search continues in the background. You can keep waiting or open Explore Routes to pick a curated ride.
            </p>
            <div className="flex flex-col gap-2 mt-4 sm:flex-row">
              <button
                type="button"
                onClick={handleRouteSlowModalKeepWaiting}
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-900 font-bold text-[13px] rounded-xl py-2.5"
              >
                Keep waiting
              </button>
              <button
                type="button"
                onClick={handleRouteSlowModalRideExplore}
                className="flex-1 bg-blue-700 hover:bg-blue-800 text-white font-bold text-[13px] rounded-xl py-2.5"
              >
                Ride Explore route
              </button>
            </div>
          </div>
        </div>
      )}

      {explorePickerOpen && (
        <div className="absolute inset-0 z-[2005] flex items-center justify-center bg-black/55 backdrop-blur-sm p-3">
          <div className="relative flex max-h-[min(85vh,540px)] w-[92%] max-w-[480px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 py-2 pl-4 pr-1">
              <div className="text-[16px] font-extrabold text-slate-900">Explore Routes</div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setExplorePickerOpen(false)}
                className="rounded-full p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200"
              >
                <X size={22} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
              {exploreRoutes.length > 0 ? (
                <div className="flex flex-col gap-3 pb-2">
                  {exploreRoutes.map((route) => (
                    <ExploreRouteRow
                      key={route.id}
                      route={route}
                      speedKmH={speedKmH}
                      onPick={(r) => {
                        setExplorePickerOpen(false);
                        void handleLoadFavorite(r);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className="px-2 py-6 text-center text-[13px] leading-snug text-slate-500">
                  No explore routes loaded. Run <span className="font-mono text-[12px] text-slate-700">npm run build:default-routes</span> to build catalog assets.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute left-1/2 -translate-x-1/2 z-[75] pointer-events-none px-2 text-center" style={{ top: SAFE_TOP_1REM }}>
          <span className="route-search-blink text-white font-bold text-sm text-glow-black">Searching for route...</span>
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
      {/* 맵: inset-0 + 명시 높이. opacity/transform 트랜지션 금지 — Mapbox WebGL이 페이드 중·transition-all 중 치수 0으로 그리는 경우가 있음. */}
      <div
        ref={mapRef}
        className={`bg-slate-900 absolute inset-0 z-10 min-h-0 h-full w-full ${!mapRevealed ? 'invisible pointer-events-none' : ''}`}
      />
      {rideMapillaryStreet && route?.path?.length ? (
        <div
          className="fixed z-[1005] pointer-events-auto flex flex-col overflow-hidden rounded-xl border border-slate-600/80 bg-black/90 shadow-2xl max-h-[min(42vh,300px)]"
          style={{
            left: SAFE_LEFT_1REM,
            top: SAFE_TOP_SPEED_PANEL,
            width: 'min(calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 2rem), 360px)',
          }}
          role="dialog"
          aria-label="Mapillary 거리뷰"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2 py-1 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/90">Mapillary</span>
            <button
              type="button"
              onClick={() => {
                lastMapillaryStreetDismissedKeyRef.current = rideMapillaryStreet.imageKey;
                setRideMapillaryStreet(null);
              }}
              className="rounded-md p-1 text-white/80 hover:bg-white/10 hover:text-white touch-manipulation"
              title="닫기"
              aria-label="Mapillary 거리뷰 닫기"
            >
              <X size={16} />
            </button>
          </div>
          <div className="relative w-full aspect-video bg-black shrink-0">
            <MapillaryRideViewer
              accessToken={MAPILLARY_CLIENT_TOKEN}
              imageId={rideMapillaryStreet.imageKey}
              sphericalNavigation={rideMapillaryStreet.isPano === true}
              lookAt={mapillaryRideSync.lookAt}
              driveHeadingDeg={mapillaryRideSync.driveHeadingDeg}
              className="absolute inset-0 h-full w-full"
            />
          </div>
          <p className="text-[9px] text-white/55 px-2 py-1 border-t border-white/10 shrink-0 leading-tight">
            Imagery © Mapillary contributors
          </p>
        </div>
      ) : null}
      {simulation.isActive && coachData && coachingMentVisible && (
        <div className="absolute left-1/2 -translate-x-1/2 z-[9999] pointer-events-none px-2 text-center" style={{ top: SAFE_TOP_1REM }}>
          <span className="text-white font-bold text-sm text-glow-black">{coachData.tip}</span>
        </div>
      )}



      {/* 지도 스타일 4종 */}
      <div
        className="fixed z-[1000] pointer-events-auto flex flex-col gap-1.5 items-center"
        style={{
          right: 'calc(env(safe-area-inset-right, 0px) + 4rem)',
          top: SAFE_TOP_1REM,
        }}
        role="radiogroup"
        aria-label="지도 스타일"
      >
        {MAP_STYLE_CONTROLS.map(({ id, title, Icon }) => {
          const active = mapType === id;
          return (
            <button
              key={id}
              type="button"
              onPointerDown={stopPointerPropagation}
              onTouchStart={stopPointerPropagation}
              onTouchEnd={(e) => activateFromTouchEnd(e, () => applyMapStyle(id))}
              onClick={() => applyMapStyle(id)}
              title={title}
              aria-label={title}
              aria-checked={active}
              role="radio"
              className={`w-[2.35rem] h-[2.35rem] rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center touch-manipulation border-2 ${
                active ? 'bg-emerald-600 border-emerald-700 text-white' : 'bg-white border-slate-200 text-slate-500'
              }`}
            >
              <Icon size={17} className="pointer-events-none shrink-0" strokeWidth={active ? 2.4 : 2} />
            </button>
          );
        })}
      </div>
      {/* OSRM 맵 도로(Mapbox composite) + Mapillary — 나란히 비교, 아래에 3D */}
      <div
        className="fixed z-[1000] pointer-events-auto flex flex-col gap-0.5 items-center"
        style={{
          right: SAFE_RIGHT_1REM,
          top: SAFE_TOP_1REM,
        }}
      >
        <button
          type="button"
          onPointerDown={stopPointerPropagation}
          onTouchStart={stopPointerPropagation}
          onTouchEnd={(e) => activateFromTouchEnd(e, toggleRouteCoverageVisibleUi)}
          onClick={toggleRouteCoverageVisibleUi}
          title={
            routeCoverageVisible
              ? 'OSRM/맵 도로 끄기 (Mapbox 주행 가능 도로)'
              : 'OSRM/맵 도로 켜기 — 위성 단독 스타일에서는 도로 벡터가 없을 수 있음'
          }
          aria-label={routeCoverageVisible ? 'Hide OSRM map roads overlay' : 'Show OSRM map roads overlay'}
          aria-pressed={routeCoverageVisible}
          className={`w-[2.4rem] h-[2.4rem] rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center touch-manipulation ${
            routeCoverageVisible ? 'bg-cyan-500 text-white' : 'bg-white text-cyan-700'
          }`}
        >
          <img
            src="/cycle_road.png"
            alt=""
            className={`pointer-events-none w-[1.05rem] h-[1.05rem] object-contain ${routeCoverageVisible ? 'opacity-100' : 'opacity-70 grayscale'}`}
          />
        </button>
        <button
          type="button"
          onPointerDown={stopPointerPropagation}
          onTouchStart={stopPointerPropagation}
          onTouchEnd={(e) => activateFromTouchEnd(e, toggleMapillaryBasicCoverageVisibleUi)}
          onClick={toggleMapillaryBasicCoverageVisibleUi}
          disabled={!mapillaryTokenConfigured}
          title={
            mapillaryTokenConfigured
              ? mapillaryBasicCoverageVisible
                ? 'Mapillary 기본 커버리지 끄기 (촬영 경로)'
                : 'Mapillary 기본 커버리지 켜기'
              : '.env.local 에 VITE_MAPILLARY_CLIENT_TOKEN 설정'
          }
          aria-pressed={mapillaryBasicCoverageVisible}
          className={`w-[2.4rem] h-[2.4rem] rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center touch-manipulation ${
            mapillaryTokenConfigured
              ? mapillaryBasicCoverageVisible
                ? 'bg-emerald-700 text-white'
                : 'bg-white text-emerald-700'
              : 'bg-slate-200 text-slate-400 opacity-60'
          }`}
        >
          <Camera size={18} className="pointer-events-none" />
        </button>
        <button
          type="button"
          onPointerDown={stopPointerPropagation}
          onTouchStart={stopPointerPropagation}
          onTouchEnd={(e) => activateFromTouchEnd(e, toggleMapillaryPanoCoverageVisibleUi)}
          onClick={toggleMapillaryPanoCoverageVisibleUi}
          disabled={!mapillaryTokenConfigured}
          title={
            mapillaryTokenConfigured
              ? mapillaryPanoCoverageVisible
                ? 'Mapillary 360° 커버리지 끄기'
                : 'Mapillary 360° 커버리지 켜기 (파노 구간)'
              : '.env.local 에 VITE_MAPILLARY_CLIENT_TOKEN 설정'
          }
          aria-pressed={mapillaryPanoCoverageVisible}
          className={`w-[2.4rem] h-[2.4rem] rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center touch-manipulation ${
            mapillaryTokenConfigured
              ? mapillaryPanoCoverageVisible
                ? 'bg-sky-600 text-white'
                : 'bg-white text-sky-600'
              : 'bg-slate-200 text-slate-400 opacity-60'
          }`}
        >
          <Aperture size={18} className="pointer-events-none" />
        </button>
        {simulation.isActive && (
          <button
            type="button"
            onPointerDown={stopPointerPropagation}
            onTouchStart={stopPointerPropagation}
            onTouchEnd={(e) =>
              activateFromTouchEnd(e, () => setRideRearCameraFollow((v) => !v))
            }
            onClick={() => setRideRearCameraFollow((v) => !v)}
            title={
              rideRearCameraFollow
                ? '후방 추적 카메라 끄기 — 맵을 마우스·터치로 움직일 수 있습니다'
                : '후방 추적 카메라 켜기 — 라이더 뒤에서 맵이 따라갑니다'
            }
            aria-pressed={rideRearCameraFollow}
            aria-label={
              rideRearCameraFollow ? '후방 추적 카메라 끄기' : '후방 추적 카메라 켜기'
            }
            className={`w-[2.4rem] h-[2.4rem] rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center touch-manipulation ${
              rideRearCameraFollow
                ? 'bg-violet-600 text-white border-2 border-violet-700'
                : 'bg-white text-slate-600 border-2 border-slate-200'
            }`}
          >
            {rideRearCameraFollow ? (
              <LocateFixed size={18} className="pointer-events-none shrink-0" strokeWidth={2.2} />
            ) : (
              <Move size={18} className="pointer-events-none shrink-0" strokeWidth={2.2} />
            )}
          </button>
        )}
      </div>
      <div
        className="fixed z-[1000] pointer-events-auto"
        style={{
          right: SAFE_RIGHT_1REM,
          top: SAFE_TOP_3D_BTN,
        }}
      >
        <button
          type="button"
          onPointerDown={stopPointerPropagation}
          onTouchStart={stopPointerPropagation}
          onTouchEnd={(e) => activateFromTouchEnd(e, () => setMap3DEnabled((prev) => !prev))}
          onClick={() => setMap3DEnabled((prev) => !prev)}
          title={map3DEnabled ? '3D 보기 Off' : '3D 보기 On'}
          aria-label={map3DEnabled ? 'Disable 3D map' : 'Enable 3D map'}
          className={`w-[2.4rem] h-[2.4rem] rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center touch-manipulation ${
            map3DEnabled ? 'bg-sky-100 text-sky-700' : 'bg-white text-slate-500'
          }`}
        >
          <Box size={16} className="pointer-events-none" />
        </button>
      </div>

      {/* Current Speed / Avg Speed / Current RPM - top-right overlay */}
      <div
        className="fixed z-[1000] flex flex-col items-end leading-none select-none"
        style={{
          right: 'calc(env(safe-area-inset-right, 0px) + 1rem)',
          top: SAFE_TOP_SPEED_PANEL,
          pointerEvents: 'none',
        }}
      >
        {/* Feel 트림: 실제 센서 연결 시에만 보이고, 공간은 항상 유지해 아래 텍스트 줄이 움직이지 않게 함 */}
        <div
          className={`mb-1 flex items-center gap-1 bg-black/50 rounded-full px-1.5 py-0.5 border border-white/20 ${
            sensorPrefs.sensorDriveEnabled && sensorHubConnected ? '' : 'invisible pointer-events-none'
          }`}
          style={{ pointerEvents: sensorPrefs.sensorDriveEnabled && sensorHubConnected ? 'auto' : 'none' }}
          title={sensorPrefs.sensorDriveEnabled && sensorHubConnected ? 'Feel adjust: subtle speed multiplier' : undefined}
          aria-hidden={!(sensorPrefs.sensorDriveEnabled && sensorHubConnected)}
        >
          <button
            type="button"
            onClick={adjustFeelKDown}
            disabled={!(sensorPrefs.sensorDriveEnabled && sensorHubConnected) || (sensorPrefs.feelK ?? 1) <= FEEL_K_MIN + 1e-6}
            className="w-5 h-5 flex items-center justify-center rounded-full bg-white text-slate-800 text-[12px] font-black leading-none disabled:opacity-40"
            aria-label="Decrease feel"
            tabIndex={sensorPrefs.sensorDriveEnabled && sensorHubConnected ? undefined : -1}
          >
            −
          </button>
          <button
            type="button"
            onClick={resetFeelK}
            disabled={!(sensorPrefs.sensorDriveEnabled && sensorHubConnected)}
            className="text-[12px] font-black text-white tabular-nums leading-none px-1 [text-shadow:0_0_2px_#000] disabled:opacity-40"
            aria-label="Reset feel"
            title="Long-press/tap to reset"
            tabIndex={sensorPrefs.sensorDriveEnabled && sensorHubConnected ? undefined : -1}
          >
            {Math.round((sensorPrefs.feelK ?? 1) * 100)}%
          </button>
          <button
            type="button"
            onClick={adjustFeelKUp}
            disabled={!(sensorPrefs.sensorDriveEnabled && sensorHubConnected) || (sensorPrefs.feelK ?? 1) >= FEEL_K_MAX - 1e-6}
            className="w-5 h-5 flex items-center justify-center rounded-full bg-white text-slate-800 text-[12px] font-black leading-none disabled:opacity-40"
            aria-label="Increase feel"
            tabIndex={sensorPrefs.sensorDriveEnabled && sensorHubConnected ? undefined : -1}
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
              title="장소 검색 (Mapbox)"
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
              aria-label="장소 추천 (Mapbox Geocoding)"
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
        className={`absolute z-[1000] flex items-end transition-all duration-300 ease-out ${(showOriginSuggestions || showDestinationSuggestions) ? 'overflow-visible' : 'overflow-hidden'} pointer-events-auto ${routeInputExpanded ? (historyExpanded ? (routeSettingsPanelExpanded ? 'w-[598px] min-w-[598px] max-w-[598px]' : 'w-[370px] min-w-[370px] max-w-[370px]') : (routeSettingsPanelExpanded ? 'w-[282px] min-w-[282px] max-w-[282px]' : 'w-[80px] min-w-[80px] max-w-[80px]')) : 'w-[2.4rem] h-[2.4rem] border-2 border-blue-600 rounded-full group'}`}
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
                      <ul className="absolute top-full left-0 w-[156%] mt-0.5 py-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[70] max-h-40 overflow-y-auto" role="listbox" aria-activedescendant={originHighlightIndex >= 0 ? `origin-suggestion-${originHighlightIndex}` : undefined}>
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
                      <ul className="absolute top-full left-0 w-[156%] mt-0.5 py-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[70] max-h-40 overflow-y-auto" role="listbox" aria-activedescendant={destinationHighlightIndex >= 0 ? `dest-suggestion-${destinationHighlightIndex}` : undefined}>
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
                      onClick={() => setHistoryPanelTab('explore')}
                      className={`shrink-0 text-[9px] font-bold tracking-wide pb-0.5 -mb-px border-b-2 transition-colors ${historyPanelTab === 'explore' ? 'text-slate-600 border-blue-500' : 'text-slate-400 border-transparent hover:text-slate-500'}`}
                    >
                      Explore Routes
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
                  exploreRoutes.length > 0 ? (
                    <div className="flex min-h-0 max-h-[40vh] flex-col gap-2.5 overflow-y-auto overscroll-contain py-1 pr-0.5">
                      {exploreRoutes.map((route) => (
                        <ExploreRouteRow
                          key={route.id}
                          route={route}
                          compact
                          speedKmH={speedKmH}
                          onPick={(r) => {
                            void handleLoadFavorite(r);
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400 text-center italic mt-2 px-1 leading-tight">
                      No bundled explore routes. Run <span className="font-mono not-italic">npm run build:default-routes</span> to generate <span className="font-mono not-italic">public/explore-routes/</span>. Cloud sync later.
                    </div>
                  )
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
          menuView={menuView}
          setMenuView={setMenuView}
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
