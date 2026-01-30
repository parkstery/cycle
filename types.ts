
export interface RouteInfo {
  origin: string;
  destination: string;
  distance: string;
  duration: string;
  path: any[];
  elevation: ElevationPoint[];
  totalDistanceMeters?: number;
  cumulativeDistances?: number[];
}

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
