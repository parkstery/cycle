/** Path index → PanoID + heading (pre-fetched, no API during RUNNING) */
export interface PanoDataItem {
  pathIndex: number;
  panoId: string;
  location: any;
  heading: number;
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
  /** Pre-fetched Street View metadata (100m intervals); used in RUNNING without API */
  panoData?: PanoDataItem[];
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
}
