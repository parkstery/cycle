
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Search, Navigation, Play, Pause, RotateCcw, Trash2, X, MapPin, Target, User, Volume2, AreaChart as AreaChartIcon, ChevronRight, ChevronLeft } from 'lucide-react';
import { RouteInfo, TravelMode, SimulationState } from './types';
import { getCyclingStrategy } from './services/aiCoach';

// Declare google global
declare var google: any;

const App: React.FC = () => {
  // Map & Service References
  const mapRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const googleMap = useRef<any>(null);
  const directionsRenderer = useRef<any>(null);
  const simulationMarker = useRef<any>(null);
  const startMarker = useRef<any>(null);
  const endMarker = useRef<any>(null);
  const tempMarker = useRef<any>(null);
  const panorama = useRef<any>(null);
  const geocoder = useRef<any>(null);

  // App Core State
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [simulation, setSimulation] = useState<SimulationState>({ isActive: false, currentIndex: 0, speed: 500 });
  const [speedKmH, setSpeedKmH] = useState(60); // Default 60km/h
  const [mode, setMode] = useState<TravelMode>(TravelMode.BICYCLING);
  const [aiCoachMsg, setAiCoachMsg] = useState<string | null>(null);
  const [showAiCoach, setShowAiCoach] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isSvActive, setIsSvActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Folding States
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [routeInputExpanded, setRouteInputExpanded] = useState(true);
  const [elevationExpanded, setElevationExpanded] = useState(true);

  // Input States
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [clickedLocation, setClickedLocation] = useState<{lat: number, lng: number, address: string} | null>(null);

  // Helper: Speed KM/H to MS delay mapping
  const calculateDelay = (kmh: number) => {
    return Math.max(100, 2000 - (kmh * 15.8));
  };

  // TTS Function
  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US'; 
    utterance.rate = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const createCustomMarker = (latLng: any, label: string, color: string) => {
    return new google.maps.Marker({
      position: latLng,
      map: googleMap.current,
      label: {
        text: label,
        color: 'white',
        fontWeight: 'bold',
        fontSize: '14px'
      },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 14,
        fillColor: color,
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: '#ffffff'
      }
    });
  };

  const clearMapOverlays = () => {
    if (directionsRenderer.current) directionsRenderer.current.setDirections({ routes: [] });
    if (simulationMarker.current) { simulationMarker.current.setMap(null); simulationMarker.current = null; }
    if (startMarker.current) { startMarker.current.setMap(null); startMarker.current = null; }
    if (endMarker.current) { endMarker.current.setMap(null); endMarker.current = null; }
    setRoute(null);
    setSimulation({ isActive: false, currentIndex: 0, speed: calculateDelay(speedKmH) });
    setAiCoachMsg(null);
    setOrigin('');
    setDestination('');
  };

  const clearTempMarker = () => {
    if (tempMarker.current) {
      tempMarker.current.setMap(null);
      tempMarker.current = null;
    }
    setClickedLocation(null);
  };

  useEffect(() => {
    if (mapRef.current && !googleMap.current) {
      googleMap.current = new google.maps.Map(mapRef.current, {
        center: { lat: 37.3422, lng: 127.9202 },
        zoom: 15,
        mapId: 'ef6d149e63d71cf93952c9bb',
        disableDefaultUI: true,
        clickableIcons: false,
      });

      geocoder.current = new google.maps.Geocoder();
      directionsRenderer.current = new google.maps.DirectionsRenderer({
        map: googleMap.current,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#3b82f6',
          strokeWeight: 5,
          strokeOpacity: 0.8
        }
      });

      panorama.current = new google.maps.StreetViewPanorama(svRef.current, {
        visible: false,
        addressControl: false,
        linksControl: false,
        panControl: true,
        enableCloseButton: true,
        zoomControl: false,
        fullscreenControl: false,
      });

      panorama.current.addListener('visible_changed', () => {
        setIsSvActive(panorama.current.getVisible());
        setTimeout(() => {
          if (googleMap.current) google.maps.event.trigger(googleMap.current, 'resize');
        }, 300);
      });

      googleMap.current.addListener('click', (e: any) => {
        const latLng = e.latLng;
        geocoder.current.geocode({ location: latLng }, (results: any, status: string) => {
          if (status === 'OK' && results[0]) {
            if (tempMarker.current) tempMarker.current.setMap(null);
            tempMarker.current = new google.maps.Marker({
              position: latLng,
              map: googleMap.current,
              animation: google.maps.Animation.DROP,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: '#3b82f6',
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: '#ffffff'
              }
            });
            setClickedLocation({
              lat: latLng.lat(),
              lng: latLng.lng(),
              address: results[0].formatted_address
            });
            setRouteInputExpanded(true);
          }
        });
      });
    }
  }, []);

  const handlePlaceSearch = () => {
    if (!searchTerm) return;
    geocoder.current.geocode({ address: searchTerm }, (results: any, status: string) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        googleMap.current.setCenter(loc);
        googleMap.current.setZoom(17);
        if (tempMarker.current) tempMarker.current.setMap(null);
        tempMarker.current = new google.maps.Marker({ position: loc, map: googleMap.current, animation: google.maps.Animation.DROP });
        setClickedLocation({ lat: loc.lat(), lng: loc.lng(), address: results[0].formatted_address });
      }
    });
  };

  const calculateRoute = useCallback(async (targetMode?: TravelMode, autoStart: boolean = false) => {
    const activeMode = targetMode || mode;
    if (!origin || !destination) return;
    setLoading(true);
    setAiCoachMsg(null);
    setShowAiCoach(true);
    clearTempMarker(); 
    
    const ds = new google.maps.DirectionsService();
    const es = new google.maps.ElevationService();
    
    try {
      const result = await ds.route({ 
        origin, 
        destination, 
        travelMode: google.maps.TravelMode[activeMode] 
      });
      
      if (result.routes[0]) {
        directionsRenderer.current?.setDirections(result);
        const path = result.routes[0].overview_path;
        const elevationRes = await es.getElevationAlongPath({ path, samples: 100 });
        
        if (startMarker.current) startMarker.current.setMap(null);
        if (endMarker.current) endMarker.current.setMap(null);
        startMarker.current = createCustomMarker(path[0], 'A', '#3b82f6');
        endMarker.current = createCustomMarker(path[path.length - 1], 'B', '#ef4444');

        const newRoute: RouteInfo = {
          origin, destination,
          distance: result.routes[0].legs[0].distance?.text || '',
          duration: result.routes[0].legs[0].duration?.text || '',
          path, elevation: elevationRes.results,
        };
        
        setRoute(newRoute);
        
        // 경로 선택 시 패널 접힘/펼침 방지 로직 (autoStart인 경우에만 접기/펼치기 수행)
        if (autoStart) {
          setElevationExpanded(true);
          setRouteInputExpanded(false);
          setSimulation(prev => ({ 
            ...prev, 
            isActive: true, 
            currentIndex: 0,
            speed: calculateDelay(speedKmH)
          }));
          const tip = await getCyclingStrategy(elevationRes.results);
          setAiCoachMsg(tip);
          speak(tip);
        } else {
          // GO 버튼이 아닌 경로 변경(BIKE/WALK/DRIVE) 시에는 현재 시뮬레이션 상태 유지 (주행하지 않음)
          setSimulation(prev => ({ 
            ...prev, 
            isActive: false, 
            currentIndex: prev.currentIndex,
            speed: calculateDelay(speedKmH)
          }));
        }
      }
    } catch (err) {
      console.error("Route calculation failed:", err);
    } finally {
      setLoading(false);
    }
  }, [origin, destination, mode, speedKmH]);

  const handleModeChange = (newMode: TravelMode) => {
    setMode(newMode);
    if (origin && destination) {
      calculateRoute(newMode, false); // 경로 비교만 수행 (주행 X, 패널 상태 변화 X)
    }
  };

  const handleSetStart = () => {
    if (!clickedLocation) return;
    setOrigin(clickedLocation.address);
    if (startMarker.current) startMarker.current.setMap(null);
    startMarker.current = createCustomMarker({lat: clickedLocation.lat, lng: clickedLocation.lng}, 'A', '#3b82f6');
    clearTempMarker();
    if (destination) calculateRoute(mode, false);
  };

  const handleSetEnd = () => {
    if (!clickedLocation) return;
    setDestination(clickedLocation.address);
    if (endMarker.current) endMarker.current.setMap(null);
    endMarker.current = createCustomMarker({lat: clickedLocation.lat, lng: clickedLocation.lng}, 'B', '#ef4444');
    clearTempMarker();
    if (origin) calculateRoute(mode, false);
  };

  useEffect(() => {
    let timer: number;
    if (simulation.isActive && route && simulation.currentIndex < route.path.length) {
      if (panorama.current && !panorama.current.getVisible()) {
        const currentPos = route.path[simulation.currentIndex];
        panorama.current.setPosition(currentPos);
        panorama.current.setVisible(true);
      }

      timer = window.setTimeout(() => {
        const currentPos = route.path[simulation.currentIndex];
        if (!simulationMarker.current) {
          simulationMarker.current = new google.maps.Marker({
            position: currentPos,
            map: googleMap.current,
            icon: { 
              path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, 
              scale: 5, 
              fillColor: '#3b82f6', 
              fillOpacity: 1, 
              strokeWeight: 2, 
              strokeColor: '#ffffff',
              rotation: 0 
            }
          });
        }
        const nextPos = route.path[simulation.currentIndex + 1] || currentPos;
        const heading = google.maps.geometry.spherical.computeHeading(currentPos, nextPos);
        simulationMarker.current.setPosition(currentPos);
        simulationMarker.current.setOptions({ rotation: heading });
        
        if (panorama.current?.getVisible()) {
          panorama.current.setPosition(currentPos);
          const currentPov = panorama.current.getPov();
          panorama.current.setPov({ heading, pitch: currentPov.pitch });
        }
        setSimulation(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
      }, simulation.speed);
    } else if (simulation.currentIndex >= (route?.path.length || 0)) {
      setSimulation(prev => ({ ...prev, isActive: false }));
    }
    return () => clearTimeout(timer);
  }, [simulation, route]);

  useEffect(() => {
    setSimulation(prev => ({ ...prev, speed: calculateDelay(speedKmH) }));
  }, [speedKmH]);

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden font-sans relative">
      <div ref={svRef} className={`bg-black transition-all duration-500 ease-in-out relative ${isSvActive ? 'h-[50%] opacity-100 z-20 border-b-2 border-slate-700' : 'h-0 opacity-0 pointer-events-none z-0'}`} />
      <div ref={mapRef} className={`flex-1 relative z-10`} />

      {/* 1. LOCATION SEARCH PANEL */}
      <div className={`absolute top-4 left-4 z-[60] flex items-center transition-all duration-300 ease-out overflow-hidden ${searchExpanded ? 'w-[calc(100%-100px)] max-w-[240px]' : 'w-12 h-12'}`}>
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl flex items-center w-full h-12 border border-slate-200 pr-2">
          <button onClick={() => setSearchExpanded(!searchExpanded)} className="flex-shrink-0 w-12 h-12 flex items-center justify-center text-slate-500 hover:text-blue-600">
            {searchExpanded ? <ChevronLeft size={20} /> : <Search size={20} />}
          </button>
          <input 
            type="text" 
            placeholder="Search place..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePlaceSearch()}
            className="flex-1 bg-transparent border-none outline-none text-slate-900 font-bold text-[12px] px-2"
          />
        </div>
      </div>

      {/* STREET VIEW TOGGLE (Pegman) */}
      <button 
        onClick={() => panorama.current?.setVisible(!isSvActive)} 
        className={`absolute right-4 top-4 z-50 w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center ${isSvActive ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-400'}`}
      >
        <User size={24} fill={isSvActive ? "currentColor" : "none"} />
      </button>

      {/* AI COACH MESSAGE */}
      {aiCoachMsg && showAiCoach && (
        <div className="absolute top-20 left-4 z-50 max-w-[70%] animate-in fade-in slide-in-from-left-4 duration-500">
          <div className={`p-3 rounded-2xl shadow-xl flex gap-3 items-center border border-white/20 transition-all ${isSpeaking ? 'bg-blue-600' : 'bg-slate-900/90 backdrop-blur-md'}`}>
            <Volume2 size={14} className="text-white shrink-0" />
            <p className="text-[10px] font-bold text-white leading-snug">{aiCoachMsg}</p>
            <button onClick={() => { setShowAiCoach(false); window.speechSynthesis.cancel(); }} className="p-1 text-white/40"><X size={8}/></button>
          </div>
        </div>
      )}

      {/* 2. ROUTE PLANNING PANEL */}
      <div className={`absolute bottom-4 left-4 z-[50] flex items-end transition-all duration-300 ease-out overflow-hidden ${routeInputExpanded ? 'w-[85%] max-w-[340px]' : 'w-12 h-12'}`}>
        <div className="bg-white/95 backdrop-blur-md rounded-[2.5rem] shadow-2xl flex items-stretch w-full border border-slate-200 p-1">
          <button onClick={() => setRouteInputExpanded(!routeInputExpanded)} className="flex-shrink-0 w-10 flex items-center justify-center text-slate-500 hover:text-blue-600">
            {routeInputExpanded ? <ChevronLeft size={20} /> : <Navigation size={20} />}
          </button>
          
          {routeInputExpanded && (
            <>
              <div className="flex-1 px-2 py-2 space-y-2">
                <div className="flex flex-col gap-1.5">
                  <input type="text" placeholder="Start..." value={origin} onChange={(e) => setOrigin(e.target.value)} className="w-full bg-slate-50 rounded-xl py-2 px-3 text-slate-900 font-bold text-[12px] outline-none border border-transparent focus:border-blue-400" />
                  <input type="text" placeholder="Goal..." value={destination} onChange={(e) => setDestination(e.target.value)} className="w-full bg-slate-50 rounded-xl py-2 px-3 text-slate-900 font-bold text-[12px] outline-none border border-transparent focus:border-blue-400" />
                </div>
                <div className="flex gap-1.5">
                  {Object.values(TravelMode).map((m) => (
                    <button 
                      key={m} 
                      onClick={() => handleModeChange(m)} 
                      className={`flex-1 py-2 rounded-xl text-[12px] font-black transition-all ${mode === m ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}
                    >
                      {m === TravelMode.BICYCLING ? 'BIKE' : m === TravelMode.WALKING ? 'WALK' : 'DRIVE'}
                    </button>
                  ))}
                  <button onClick={() => calculateRoute(mode, true)} disabled={loading || !origin || !destination} className="flex-1 bg-blue-600 text-white font-black text-[12px] rounded-xl shadow-md disabled:bg-slate-200 active:scale-95 transition-transform">
                    {loading ? '...' : 'GO'}
                  </button>
                </div>
              </div>

              {/* VERTICAL SPEED DIAL (10km - 120km) */}
              <div className="w-12 flex flex-col items-center border-l border-slate-100 py-1 overflow-hidden">
                <span className="text-[6px] font-black text-slate-400 uppercase mb-1">km/h</span>
                <div className="flex-1 overflow-y-auto space-y-0.5 px-1 scrollbar-hide flex flex-col items-center max-h-[100px]">
                  {Array.from({length: 12}, (_, i) => (i + 1) * 10).map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setSpeedKmH(speed)}
                      className={`flex-shrink-0 w-full py-1.5 rounded-lg text-[12px] font-black transition-all text-center ${speedKmH === speed ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
                    >
                      {speed}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3. ELEVATION PANEL */}
      {route && (
        <div className={`absolute bottom-4 right-4 z-[50] flex items-end justify-end transition-all duration-300 ease-out overflow-hidden ${elevationExpanded ? 'w-[80%] max-w-md' : 'w-12 h-12'}`}>
          <div className="bg-white/95 backdrop-blur-md rounded-[2rem] shadow-2xl flex items-center w-full border border-slate-200 p-1">
            <button onClick={() => setElevationExpanded(!elevationExpanded)} className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-slate-500 hover:text-blue-600 order-last">
              {elevationExpanded ? <ChevronRight size={20} /> : <AreaChartIcon size={20} />}
            </button>
            {elevationExpanded && (
              <div className="flex-1 px-3 py-1 flex flex-col gap-1.5">
                <div className="flex justify-between items-center px-1">
                  <div className="min-w-0">
                    <h2 className="text-slate-900 font-black text-sm tracking-tighter leading-none">{route.distance}</h2>
                    <p className="text-slate-400 text-[7px] font-black uppercase tracking-widest">{route.duration}</p>
                  </div>
                  <div className="flex gap-1 items-center">
                    <button onClick={() => setSimulation(prev => ({ ...prev, isActive: !prev.isActive }))} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${simulation.isActive ? 'bg-amber-100 text-amber-600' : 'bg-blue-600 text-white'}`}>
                      {simulation.isActive ? <Pause size={12} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <button onClick={() => setSimulation({ ...simulation, isActive: true, currentIndex: 0 })} className="w-8 h-8 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center"><RotateCcw size={14} /></button>
                    <button onClick={clearMapOverlays} className="w-8 h-8 bg-red-50 text-red-500 rounded-xl flex items-center justify-center"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="h-10 w-full bg-slate-900 rounded-xl p-1 relative overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={route.elevation} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorElev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="elevation" stroke="#3b82f6" strokeWidth={1.5} fill="url(#colorElev)" isAnimationActive={false} />
                      <ReferenceLine x={Math.floor((simulation.currentIndex / route.path.length) * (route.elevation.length - 1))} stroke="#ffffff" strokeWidth={1} strokeDasharray="2 2" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CLICKED LOCATION POPUP */}
      {clickedLocation && (
        <div className="absolute top-[30%] left-1/2 -translate-x-1/2 z-50 w-[70%] max-w-[240px] animate-in slide-in-from-bottom-2 duration-300">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3 shadow-2xl border border-slate-200">
            <button onClick={clearTempMarker} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-1.5 shadow-lg"><X size={10}/></button>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 bg-blue-100 rounded text-blue-600"><MapPin size={12} /></div>
              <p className="text-slate-800 text-[12px] font-bold line-clamp-1">{clickedLocation.address}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleSetStart} className="py-2 bg-blue-50 text-blue-700 rounded-lg text-[12px] font-black uppercase">START (A)</button>
              <button onClick={handleSetEnd} className="py-2 bg-blue-600 text-white rounded-lg text-[12px] font-black uppercase">END (B)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
