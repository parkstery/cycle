
export interface RouteInfo {
  origin: string;
  destination: string;
  distance: string;
  duration: string;
  // Use any to avoid missing google namespace error
  path: any[];
  elevation: ElevationPoint[];
}

export interface ElevationPoint {
  elevation: number;
  // Use any to avoid missing google namespace error
  location: any;
  resolution: number;
}

export enum TravelMode {
  BICYCLING = 'BICYCLING',
  WALKING = 'WALKING',
  DRIVING = 'DRIVING'
}

export interface SimulationState {
  isActive: boolean;
  currentIndex: number;
  speed: number;
}