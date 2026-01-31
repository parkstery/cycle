
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Search, Navigation, Play, Pause, RotateCcw, Trash2, X, MapPin, Target, User, Volume2, AreaChart as AreaChartIcon, ChevronRight, ChevronLeft, History, Info, Route as RouteIcon, Zap, Activity, ShieldAlert, Bike, Footprints, Car, Maximize2, Minimize2, Waypoints, ArrowUpDown, Plus, CheckCircle2, Layers, Star, Square } from 'lucide-react';
import { RouteInfo, TravelMode, SimulationState, CoachingData, SavedRoute, PanoMetadata } from './types';
import { getAdvancedCoaching } from './services/aiCoach';

declare var google: any;

const PLAYLIST = [
  "https://www.dropbox.com/scl/fi/oq5lnyyc41rxso4kgm6en/1.mp3?rlkey=1j6uj6kxtu833jrljqz5qa0wx&st=ig1goyal&raw=1",
  "https://www.dropbox.com/scl/fi/qduirdh7mt24ucms1jn32/.mp3?rlkey=09o1232kpdahjlsns95ppbhrc&st=hsarn2s1&raw=1",
  "https://www.dropbox.com/scl/fi/8fbdd1t6v18z2m17ecidt/1.mp3?rlkey=sm15ow3aun8az4z6y2vseefy0&st=kbmlsn1m&raw=1",
  "https://www.dropbox.com/scl/fi/bvtw5s1pimhv42k3bgdxh/.mp3?rlkey=6ujd668vw7kzioe277gkqvsq7&st=cq1x65f8&raw=1",
  "https://www.dropbox.com/scl/fi/j1hzv2yx22uc0xl9redbj/1.mp3?rlkey=vjay2iyw06u84gygzxcoatz9w&st=9so3eh5n&raw=1",
  "https://www.dropbox.com/scl/fi/2avdaszs6csfvocofa9l9/.mp3?rlkey=ssqfzfmapfa3kkrqdifazbmoj&st=h4pfgwtr&raw=1"
];

const App: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const svRef1 = useRef<HTMLDivElement>(null);
  const svRef2 = useRef<HTMLDivElement>(null);
  const panorama1 = useRef<any>(null);
  const panorama2 = useRef<any>(null);
  const activePanoRef = useRef<number>(0);
  const [visiblePanoIdx, setVisiblePanoIdx] = useState<number>(0);

  const googleMap = useRef<any>(null);
  const directionsRenderer = useRef<any>(null);
  const simulationMarker = useRef<any>(null);
  const startMarker = useRef<any>(null);
  const endMarker = useRef<any>(null);
  const waypointMarkers = useRef<any[]>([]);
  
  const geocoder = useRef<any>(null);
  const placesService = useRef<any>(null);
  const elevationService = useRef<any>(null);
  const polylineOverlay = useRef<any>(null);
  const coverageLayer = useRef<any>(null);
  const svServiceRef = useRef<any>(null); 

  const originLocationRef = useRef<any>(null);
  const destLocationRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);

  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [simulation, setSimulation] = useState<SimulationState>({ isActive: false, currentIndex: 0, speed: 100 });
  const [speedKmH, setSpeedKmH] = useState(20); 
  const [mode, setMode] = useState<TravelMode>(TravelMode.BICYCLING);
  const [loading, setLoading] = useState(false);
  const [isSvActive, setIsSvActive] = useState(false);
  const [isSvFullScreen, setIsSvFullScreen] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSvWarning, setShowSvWarning] = useState(false);
  const [routeSource, setRouteSource] = useState<'GOOGLE' | 'OSRM' | null>(null);
  const [mapType, setMapType] = useState<string>('roadmap');
  
  const [elapsedTime, setElapsedTime] = useState(0);
  const [coveredDistance, setCoveredDistance] = useState(0);

  const [coachData, setCoachData] = useState<CoachingData | null>(null);
  const [isCoachThinking, setIsCoachThinking] = useState(false);

  const [searchExpanded, setSearchExpanded] = useState(false);
  const [routeInputExpanded, setRouteInputExpanded] = useState(true);
  const [elevationExpanded, setElevationExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(true);

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [waypoints, setWaypoints] = useState<{name: string, location: any}[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMapsApiLoaded, setIsMapsApiLoaded] = useState(false);
  const [clickedLocation, setClickedLocation] = useState<any>(null);

  const [favoriteRoutes, setFavoriteRoutes] = useState<SavedRoute[]>(() => {
    const saved = localStorage.getItem('favorite_routes');
    return saved ? JSON.parse(saved) : [];
  });

  const [recentPlaceSearches, setRecentPlaceSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem('recent_places');
    return saved ? JSON.parse(saved) : [];
  });

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  const setPanoramaView = useCallback((panoId: string, heading: number) => {
    const nextIdx = activePanoRef.current === 0 ? 1 : 0;
    const currentPano = activePanoRef.current === 0 ? panorama1.current : panorama2.current;
    const nextPano = nextIdx === 0 ? panorama1.current : panorama2.current;

    if (!currentPano || !nextPano) return;

    if (currentPano.getPano() === panoId) {
      currentPano.setPov({ heading, pitch: 0 });
      return;
    }

    nextPano.setOptions({ pano: panoId, pov: { heading, pitch: 0 }, visible: true });
    
    const doSwap = () => {
      activePanoRef.current = nextIdx;
      setVisiblePanoIdx(nextIdx);
      if (googleMap.current) googleMap.current.setStreetView(nextPano);
    };

    const listener = nextPano.addListener('links_changed', () => {
      google.maps.event.removeListener(listener);
      doSwap();
    });
    setTimeout(() => { if (activePanoRef.current !== nextIdx) doSwap(); }, 400);
  }, []);

  const prefetchStreetView = async (path: any[]): Promise<PanoMetadata[]> => {
    if (!svServiceRef.current) return [];
    const panoData: PanoMetadata[] = [];
    // Pre-fetch every ~100m to reduce simulation-time API calls drastically
    const STEP_DISTANCE = 100; 
    let lastPrefetchDist = -Infinity;

    for (let i = 0; i < path.length; i++) {
      const currentPos = path[i];
      const distFromStart = i === 0 ? 0 : google.maps.geometry.spherical.computeDistanceBetween(path[0], currentPos);
      
      if (distFromStart - lastPrefetchDist >= STEP_DISTANCE || i === 0 || i === path.length - 1) {
        const data = await new Promise<any>(resolve => {
          svServiceRef.current.getPanorama({
            location: currentPos, radius: 50, source: google.maps.StreetViewSource.GOOGLE
          }, (res: any, status: string) => resolve(status === 'OK' ? res : null));
        });

        if (data && data.location) {
          const nextIdx = Math.min(i + 10, path.length - 1);
          const heading = google.maps.geometry.spherical.computeHeading(currentPos, path[nextIdx]);
          panoData.push({
            pathIndex: i,
            panoId: data.location.pano,
            location: data.location.latLng,
            heading: heading
          });
          lastPrefetchDist = distFromStart;
        }
      }
    }
    return panoData;
  };

  useEffect(() => {
    if ((window as any).google && (window as any).google.maps) { setIsMapsApiLoaded(true); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.GOOGLE_MAPS_API_KEY}&libraries=places,geometry,elevation`;
    script.async = true; script.onload = () => setIsMapsApiLoaded(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (isMapsApiLoaded && mapRef.current && !googleMap.current) {
      googleMap.current = new google.maps.Map(mapRef.current, {
        center: { lat: 37.7749, lng: -122.4194 }, zoom: 14,
        mapTypeControl: false, streetViewControl: false, zoomControl: false, scaleControl: true,
        scaleControlOptions: { position: google.maps.ControlPosition.BOTTOM_LEFT },
        styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }]
      });
      directionsRenderer.current = new google.maps.DirectionsRenderer({ map: googleMap.current, suppressMarkers: true, preserveViewport: true });
      geocoder.current = new google.maps.Geocoder();
      placesService.current = new google.maps.places.PlacesService(googleMap.current);
      elevationService.current = new google.maps.ElevationService();
      svServiceRef.current = new google.maps.StreetViewService();
      coverageLayer.current = new google.maps.StreetViewCoverageLayer();
      
      const svOptions = { visible: true, enableCloseButton: false, disableDefaultUI: true, clickToGo: false };
      panorama1.current = new google.maps.StreetViewPanorama(svRef1.current, svOptions);
      panorama2.current = new google.maps.StreetViewPanorama(svRef2.current, svOptions);
      googleMap.current.setStreetView(panorama1.current);

      googleMap.current.addListener("click", (e: any) => {
        geocoder.current.geocode({ location: e.latLng }, (results: any, status: any) => {
          if (status === 'OK' && results[0]) {
            setClickedLocation({ lat: e.latLng.lat(), lng: e.latLng.lng(), name: results[0].formatted_address, address: results[0].formatted_address, location: e.latLng });
          }
        });
      });
    }
  }, [isMapsApiLoaded]);

  // Main Simulation Loop - OPTIMIZED: Uses Pre-fetched Data
  useEffect(() => {
    let timer: number;
    if (simulation.isActive && route) {
      const idx = simulation.currentIndex;
      if (idx >= route.path.length - 1) { setSimulation(prev => ({ ...prev, isActive: false })); speak("Ride finished."); return; }
      
      const currentPos = route.path[idx];
      if (!simulationMarker.current) {
        simulationMarker.current = new google.maps.Marker({ position: currentPos, map: googleMap.current, icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 5, fillColor: '#3b82f6', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } });
      }
      
      const nextIdx = Math.min(idx + 5, route.path.length - 1);
      const heading = google.maps.geometry.spherical.computeHeading(currentPos, route.path[nextIdx]);
      simulationMarker.current.setPosition(currentPos);
      simulationMarker.current.setOptions({ rotation: heading });

      // Zero-Traffic SV Logic: Use cached pano metadata
      if (isSvActive && route.panoData.length > 0) {
        const closestPano = route.panoData.reduce((prev, curr) => 
          Math.abs(curr.pathIndex - idx) < Math.abs(prev.pathIndex - idx) ? curr : prev
        );
        setPanoramaView(closestPano.panoId, heading);
      }

      // Predictive Coaching: Only call when current plan expires
      if (!coachData || idx >= coachData.validUntilIndex) {
        (async () => {
          setIsCoachThinking(true);
          const newPlan = await getAdvancedCoaching(idx, route.elevation, route.path.length, speedKmH, coachData?.resistance);
          setCoachData(newPlan); speak(newPlan.tip); setIsCoachThinking(false);
        })();
      }

      const dist = google.maps.geometry.spherical.computeDistanceBetween(currentPos, route.path[idx + 1]);
      const delay = Math.max(50, (dist / ((speedKmH * 1000) / 3600)) * 1000);
      timer = window.setTimeout(() => setSimulation(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 })), delay);
    }
    return () => clearTimeout(timer);
  }, [simulation.isActive, simulation.currentIndex, route, isSvActive, speedKmH]);

  const calculateRoute = useCallback(async (targetMode?: TravelMode, autoStart: boolean = false, custO?: string, custD?: string) => {
    const finalO = custO || origin; const finalD = custD || destination;
    if (!finalO || !finalD) return;
    setLoading(true); setElapsedTime(0); setCoveredDistance(0);
    try {
      const res = await new Promise<any>((resolve, reject) => {
        new google.maps.DirectionsService().route({
          origin: originLocationRef.current || finalO, destination: destLocationRef.current || finalD,
          waypoints: waypoints.map(w => ({ location: w.location, stopover: true })), travelMode: google.maps.TravelMode[targetMode || mode]
        }, (r: any, s: string) => s === 'OK' ? resolve(r) : reject(s));
      });

      const path = res.routes[0].overview_path;
      const densified: any[] = [];
      for (let i = 0; i < path.length - 1; i++) {
        densified.push(path[i]);
        const d = google.maps.geometry.spherical.computeDistanceBetween(path[i], path[i+1]);
        if (d > 2) {
          const steps = Math.floor(d / 2);
          const h = google.maps.geometry.spherical.computeHeading(path[i], path[i+1]);
          for (let j = 1; j <= steps; j++) densified.push(google.maps.geometry.spherical.computeOffset(path[i], j * 2, h));
        }
      }
      densified.push(path[path.length - 1]);

      const elevRes = await elevationService.current.getElevationAlongPath({ path: densified, samples: 100 });
      
      // PRE-FETCH SV METADATA (Crucial for traffic reduction)
      const panoData = await prefetchStreetView(densified);
      
      setRoute({ 
        origin: finalO, destination: finalD, 
        distance: res.routes[0].legs[0].distance.text, 
        duration: res.routes[0].legs[0].duration.text, 
        path: densified, elevation: elevRes.results, panoData 
      });
      directionsRenderer.current.setDirections(res);
      if (autoStart) setSimulation({ isActive: true, currentIndex: 0, speed: 100 });
    } catch (e) { alert("Failed to calculate route."); }
    finally { setLoading(false); }
  }, [origin, destination, waypoints, mode]);

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.onstart = () => setIsSpeaking(true); u.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const handleToggleSimulation = () => setSimulation(p => ({ ...p, isActive: !p.isActive }));
  const handleStopSimulation = () => setSimulation(p => ({ ...p, isActive: false, currentIndex: 0 }));

  return (
    <div className="fixed inset-0 bg-slate-900 overflow-hidden font-sans">
      <div className={`bg-black transition-all duration-500 ${isSvActive ? (isSvFullScreen ? 'absolute inset-0 z-40' : 'absolute top-0 h-[50%] w-full z-20 border-b border-white/10') : 'h-0 opacity-0'}`}>
        <div ref={svRef1} className={`absolute inset-0 transition-opacity ${visiblePanoIdx === 0 ? 'z-20 opacity-100' : 'z-10 opacity-0'}`} />
        <div ref={svRef2} className={`absolute inset-0 transition-opacity ${visiblePanoIdx === 1 ? 'z-20 opacity-100' : 'z-10 opacity-0'}`} />
      </div>

      <div ref={mapRef} className={`transition-all duration-500 ${isSvFullScreen ? "absolute top-4 left-4 w-32 h-32 z-50 rounded-2xl border-2 border-white shadow-xl" : (isSvActive ? "absolute bottom-0 h-[50%] w-full z-10" : "absolute inset-0 z-10")}`} />

      {simulation.isActive && coachData && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[70] w-full max-w-[80%] pointer-events-none">
          <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-3 shadow-2xl animate-in slide-in-from-top-4 duration-500 text-center">
             <p className="text-white font-bold text-sm tracking-tight">{coachData.tip}</p>
          </div>
        </div>
      )}

      <div className="absolute right-4 top-4 z-50 flex flex-col gap-2">
        <button onClick={() => setIsSvActive(!isSvActive)} className={`w-12 h-12 rounded-full shadow-xl flex items-center justify-center ${isSvActive ? 'bg-blue-600 text-white' : 'bg-white text-slate-400'}`}><User size={24} /></button>
        {isSvActive && <button onClick={() => setIsSvFullScreen(!isSvFullScreen)} className="w-12 h-12 rounded-full bg-white shadow-xl flex items-center justify-center text-slate-900">{isSvFullScreen ? <Minimize2 size={24} /> : <Maximize2 size={24} />}</button>}
      </div>

      <div className={`absolute bottom-4 left-4 z-[60] flex items-end transition-all duration-300 ${routeInputExpanded ? 'w-[calc(100%-2rem)] max-w-[450px]' : 'w-12 h-12 rounded-full overflow-hidden'}`}>
        <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-4 w-full border border-slate-200">
           <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input className="flex-1 bg-slate-100 rounded-xl px-3 h-10 text-sm outline-none font-bold" placeholder="Start" value={origin} onChange={e => setOrigin(e.target.value)} />
                <input className="flex-1 bg-slate-100 rounded-xl px-3 h-10 text-sm outline-none font-bold" placeholder="End" value={destination} onChange={e => setDestination(e.target.value)} />
              </div>
              <div className="flex items-center gap-3">
                 <span className="text-[10px] font-black text-slate-400 uppercase">Speed</span>
                 <input type="range" min="10" max="80" value={speedKmH} onChange={e => setSpeedKmH(Number(e.target.value))} className="flex-1 accent-blue-600 h-1 bg-slate-200 rounded-lg appearance-none" />
                 <span className="text-xs font-bold text-slate-700 w-12">{speedKmH} km/h</span>
              </div>
              <button onClick={() => calculateRoute()} disabled={loading} className="w-full bg-blue-600 text-white rounded-xl h-11 font-black shadow-lg active:scale-95 transition-all flex items-center justify-center">
                {loading ? <Activity size={20} className="animate-spin" /> : 'CALCULATE EXPEDITION'}
              </button>
           </div>
        </div>
      </div>

      {route && (
        <div className={`absolute bottom-4 right-4 z-[50] transition-all duration-300 ${elevationExpanded ? 'w-full max-w-[300px]' : 'w-12 h-12 rounded-full overflow-hidden'}`}>
          <div className="bg-white shadow-2xl rounded-3xl p-4 border border-slate-100">
             <div className="flex justify-between items-center mb-4">
                <div className="flex flex-col">
                   <span className="text-xs font-black text-slate-900">{route.distance}</span>
                   <span className="text-[10px] text-slate-400 font-bold">{route.duration}</span>
                </div>
                <div className="flex gap-2">
                   <button onClick={handleToggleSimulation} className={`w-10 h-10 rounded-xl flex items-center justify-center ${simulation.isActive ? 'bg-amber-100 text-amber-600' : 'bg-blue-600 text-white'}`}>{simulation.isActive ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
                   <button onClick={handleStopSimulation} className="w-10 h-10 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center"><RotateCcw size={18}/></button>
                </div>
             </div>
             <div className="h-12 w-full bg-slate-50 rounded-xl overflow-hidden">
                <ResponsiveContainer width="100%" height="100%"><AreaChart data={route.elevation}><Area type="monotone" dataKey="elevation" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} isAnimationActive={false} /><ReferenceLine x={Math.floor((simulation.currentIndex / route.path.length) * (route.elevation.length - 1))} stroke="#ef4444" strokeWidth={2}/></AreaChart></ResponsiveContainer>
             </div>
          </div>
        </div>
      )}

      {clickedLocation && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-[80%] max-w-[280px]">
          <div className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <p className="text-sm font-black text-slate-900 mb-4">{clickedLocation.name}</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setOrigin(clickedLocation.address); setClickedLocation(null); }} className="bg-blue-50 text-blue-600 h-10 rounded-xl text-xs font-bold">START HERE</button>
              <button onClick={() => { setDestination(clickedLocation.address); setClickedLocation(null); }} className="bg-blue-600 text-white h-10 rounded-xl text-xs font-bold">END HERE</button>
            </div>
            <button onClick={() => setClickedLocation(null)} className="w-full mt-3 text-slate-400 text-[10px] font-bold uppercase tracking-widest">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
