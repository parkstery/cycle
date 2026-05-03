/** Path index → PanoID + heading (pre-fetched, no API during RUNNING) */
export interface PanoDataItem {
  pathIndex: number;
  panoId: string;
  location: any;
  heading: number;
  /** true when panorama is user-contributed (fallback when no Google official imagery) */
  isUserPhoto?: boolean;
  /** [Phase 4] API 제공 시 실내/상가 필터용 (StreetViewLocation.description) */
  description?: string;
  /** 프리패치 시점 경로 누적 거리(m). 슬라이딩 연속·갭 판정에 사용 */
  distAlongRouteM?: number;
}

/** Coaching valid until this path index (predictive coaching) */
export interface CachedCoachingItem {
  coaching: CoachingData;
  validUntilPathIndex: number;
}

export interface RouteInfo {
  origin: string;
  destination: string;
  distance: string;
  duration: string;
  path: any[];
  elevation: ElevationPoint[];
  totalDistanceMeters?: number;
  cumulativeDistances?: number[];
  /** Pre-fetched Street View metadata (30m intervals); used in RUNNING without API */
  panoData?: PanoDataItem[];
  /** [Phase 5] coverage = panoCount / sampleCount. 70% 미만 시 안내 표시 */
  streetViewCoverage?: number;
  streetViewDisabled?: boolean;
  /** Predictive coaching segments; used in RUNNING without API */
  cachedCoaching?: CachedCoachingItem[];
}

/** App phase for traffic control: PREPARING = API allowed, RUNNING = cache only */
export type AppPhase = 'IDLE' | 'PREPARING' | 'RUNNING';

export interface ElevationPoint {
  elevation: number;
  location: any;
  resolution: number;
}

export enum TravelMode {
  BICYCLING = 'BICYCLING',
  WALKING = 'WALKING',
  DRIVING = 'DRIVING',
}

export interface SimulationState {
  isActive: boolean;
  currentIndex: number;
  speed: number;
}

export interface CoachingData {
  tip: string;
  resistance: string;
  intensity: 'LOW' | 'MODERATE' | 'HIGH' | 'MAX';
  action: 'SIT' | 'STAND' | 'TUCK' | 'PEDAL';
  /** Path index until which this coaching is valid (predictive coaching) */
  validUntilIndex?: number;
}

/** 저장된 경로 지오메트리(OSRM 재호출 없이 복원용). 출발/도착 위치 변동 방지.
 *  v1: provider/profile/distance/duration/fullGeometry 만 존재 (schemaVersion 없음).
 *  v2: schemaVersion === 2. densifiedGeometry/cumulativeDistances/elevationMeters/
 *      originLatLng/destLatLng/waypointLatLngs/totalDistanceMeters/createdAt 추가.
 *      v2 payload 는 네트워크 없이 경로 + 고도 + 마커 복원이 가능해야 한다.
 */
export interface SavedRoutePayload {
  /** 스키마 버전. 없으면 v1 으로 간주. */
  schemaVersion?: 2;
  provider: 'osrm';
  profile: 'cycling' | 'driving' | 'foot';
  distance: string;
  duration: string;
  /** OSRM 원본 decode 결과(densify 전). 재저장·재densify 용 */
  fullGeometry: [number, number][];
  /** 10m 간격으로 보간된 주행용 path. RUNNING 단계 currentIndex 의미 기준. */
  densifiedGeometry?: [number, number][];
  /** densifiedGeometry 각 포인트의 누적 거리(m). 주행 중 빈번한 재계산 제거용. */
  cumulativeDistances?: number[];
  /** Elevation 샘플(일반적으로 ~100개, densified path 와 1:1 아님).
   *  [lat, lng, elevationMeters]. 없으면 복원 시 평지(0) 폴백 + 백그라운드 재요청.
   */
  elevationSamples?: [number, number, number][];
  /** densified path 전체 거리(m). 숫자 원본. */
  totalDistanceMeters?: number;
  /** 저장 시점에 스냅된 출발/도착/경유지 좌표. */
  originLatLng?: [number, number];
  destLatLng?: [number, number];
  waypointLatLngs?: [number, number][];
  /** 저장 시각(ms). */
  createdAt?: number;
}

/** Explore list 썸네일: 코스별 이미지가 아니라 산·바다 등 범주별 공용 에셋(`public/explore-scene/*.svg`). */
export const EXPLORE_SCENE_CATEGORIES = ['mountain', 'sea', 'river', 'lake', 'desert', 'urban'] as const;
export type ExploreSceneCategory = (typeof EXPLORE_SCENE_CATEGORIES)[number];

/** Curated Explore Routes list / picker (bundled from explore-routes.config.json). */
export interface ExploreRouteDisplay {
  title: string;
  country: string;
  city: string;
  /** Planned catalog distance (km); may differ slightly from OSRM-built route. */
  distanceKm: number;
  elevationGain: number;
  difficulty: string;
  scene?: ExploreSceneCategory;
  /** Legacy; UI uses `scene` + public SVGs. */
  thumbnail?: string;
  tags: string[];
}

export interface SavedRoute {
  id: string;
  origin: string;
  destination: string;
  /** DEFAULT: 앱 기본 My Routes 코스, USER: 사용자 저장, EXPLORE: Explore Routes 번들 */
  source?: 'DEFAULT' | 'USER' | 'EXPLORE';
  /** Explore tab / picker metadata (optional). */
  exploreDisplay?: ExploreRouteDisplay;
  /** 기본 코스 자산 식별자 (앱 포함 기본 코스 추적용) */
  bundledId?: string;
  waypoints: {
    name: string;
    lat: number;
    lng: number;
  }[];
  timestamp: number;
  /** 있으면 불러올 때 OSRM 재요청 없이 경로 복원(위치 변동 방지) */
  routePayload?: SavedRoutePayload;
}
