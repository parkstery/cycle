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

/** 저장된 경로 지오메트리(OSRM 재호출 없이 복원용). 출발/도착 위치 변동 방지. */
export interface SavedRoutePayload {
  provider: 'osrm';
  profile: 'cycling' | 'driving' | 'foot';
  distance: string;
  duration: string;
  /** 경로 좌표 [lat, lng][] — 정밀도 6자리 이상 유지 */
  fullGeometry: [number, number][];
}

export interface SavedRoute {
  id: string;
  origin: string;
  destination: string;
  waypoints: {
    name: string;
    lat: number;
    lng: number;
  }[];
  timestamp: number;
  /** 있으면 불러올 때 OSRM 재요청 없이 경로 복원(위치 변동 방지) */
  routePayload?: SavedRoutePayload;
}
