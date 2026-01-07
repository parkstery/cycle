
import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Search, Navigation, Play, Square, ChevronDown, Map as MapIcon, MessageSquare, X, Compass, MapPin, Target, User, Volume2 } from 'lucide-react';
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
  const tempMarker = useRef<any>(null);
  const panorama = useRef<any>(null);
  const geocoder = useRef<any>(null);

  // App Core State
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [simulation, setSimulation] = useState<SimulationState>({ isActive: false, currentIndex: 0, speed: 500 });
  const [panelOpen, setPanelOpen] = useState(true);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [mode, setMode] = useState<TravelMode>(TravelMode.BICYCLING);
  const [aiCoachMsg, setAiCoachMsg] = useState<string | null>(null);
  const [showAiCoach, setShowAiCoach] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isSvActive, setIsSvActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Interaction State
  const [clickedLocation, setClickedLocation] = useState<{lat: number, lng: number, address: string} | null>(null);
  const [hudInfo, setHudInfo] = useState({ street: 'Locating...', cardinal: 'N' });

  // TTS Function
  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    // 이전 음성 중단
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const getCardinal = (heading: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(heading / 45) % 8;
    return directions[index < 0 ? index + 8 : index];
  };

  const clearMapOverlays = () => {
    if (directionsRenderer.current) directionsRenderer.current.setDirections({ routes: [] });
    if (simulationMarker.current) {
      simulationMarker.current.setMap(null);
      simulationMarker.current = null;
    }
    setRoute(null);
    setSimulation({ isActive: false, currentIndex: 0, speed: 500 });
    setAiCoachMsg(null);
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
        center: { lat: 37.3422, lng: 127.9202 }, // Wonju City Hall
        zoom: 15,
        mapId: 'ef6d149e63d71cf93952c9bb',
        disableDefaultUI: true,
      });

      geocoder.current = new google.maps.Geocoder();
      directionsRenderer.current = new google.maps.DirectionsRenderer({
        map: googleMap.current,
        suppressMarkers: false,
      });

      panorama.current = new google.maps.StreetViewPanorama(svRef.current, {
        visible: false,
        addressControl: false,
        linksControl: false,
        panControl: true,
        enableCloseButton: false, 
        zoomControl: false,
        fullscreenControl: false,
      });

      panorama.current.addListener('visible_changed', () => {
        setIsSvActive(panorama.current.getVisible());
        setTimeout(() => {
          if (googleMap.current) google.maps.event.trigger(googleMap.current, 'resize');
        }, 300);
      });

      panorama.current.addListener('position_changed', () => {
        const location = panorama.current.getLocation();
        if (location && location.description) {
          setHudInfo(prev => ({ ...prev, street: location.description }));
        }
      });

      panorama.current.addListener('pov_changed', () => {
        const pov = panorama.current.getPov();
        setHudInfo(prev => ({ ...prev, cardinal: getCardinal(pov.heading) }));
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

  useEffect(() => {
    let timer: number;
    if (simulation.isActive && route && simulation.currentIndex < route.path.length) {
      timer = window.setTimeout(() => {
        const currentPos = route.path[simulation.currentIndex];
        if (!simulationMarker.current) {
          simulationMarker.current = new google.maps.Marker({
            position: currentPos,
            map: googleMap.current,
            icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 4, fillColor: '#3b82f6', fillOpacity: 1, strokeWeight: 1, rotation: 0 }
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

  const calculateRoute = async () => {
    if (!origin || !destination) return;
    setLoading(true);
    setAiCoachMsg(null);
    setShowAiCoach(true);
    clearTempMarker(); 
    const ds = new google.maps.DirectionsService();
    const es = new google.maps.ElevationService();
    try {
      const result = await ds.route({ origin, destination, travelMode: google.maps.TravelMode[mode] });
      if (result.routes[0]) {
        directionsRenderer.current?.setDirections(result);
        const path = result.routes[0].overview_path;
        const elevationRes = await es.getElevationAlongPath({ path, samples: 100 });
        const newRoute: RouteInfo = {
          origin, destination,
          distance: result.routes[0].legs[0].distance?.text || '',
          duration: result.routes[0].legs[0].duration?.text || '',
          path, elevation: elevationRes.results,
        };
        setRoute(newRoute);
        setSimulation({ isActive: false, currentIndex: 0, speed: 500 });
        const tip = await getCyclingStrategy(elevationRes.results);
        setAiCoachMsg(tip);
        speak(tip); // 조언 생성 시 음성으로 읽어주기
      }
    } catch (err) {
      alert("Route calculation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handlePlayToggle = () => {
    const nextActive = !simulation.isActive;
    setSimulation(prev => ({ ...prev, isActive: nextActive }));
    if (nextActive && panorama.current && !panorama.current.getVisible()) {
      const currentPos = route?.path[simulation.currentIndex] || route?.path[0];
      if (currentPos) {
        panorama.current.setPosition(currentPos);
        panorama.current.setVisible(true);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden font-sans relative">
      <div ref={svRef} className={`bg-black transition-all duration-500 ease-in-out relative ${isSvActive ? 'h-[60%] opacity-100 z-20 border-b-2 border-slate-700' : 'h-0 opacity-0 pointer-events-none z-0'}`} />
      <div ref={mapRef} className={`flex-1 transition-all duration-500 ease-in-out relative z-10`} />

      <button onClick={() => panorama.current?.setVisible(!isSvActive)} className={`absolute right-4 top-20 z-50 p-3 rounded-full shadow-2xl transition-all active:scale-95 ${isSvActive ? 'bg-yellow-400 text-slate-900 scale-110' : 'bg-white text-slate-400'}`}>
        <User size={24} fill={isSvActive ? "currentColor" : "none"} />
      </button>

      {/* CLICKED LOCATION POPUP */}
      {clickedLocation && (
        <div className="absolute top-[35%] left-1/2 -translate-x-1/2 z-50 w-[80%] max-w-[280px] animate-in slide-in-from-bottom-2 duration-300">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3 shadow-2xl border border-slate-200">
            <button onClick={clearTempMarker} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-1.5 shadow-lg"><X size={10}/></button>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-blue-100 rounded-lg text-blue-600"><MapPin size={14} /></div>
              <p className="text-slate-800 text-[10px] font-bold line-clamp-1 flex-1">{clickedLocation.address}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setOrigin(clickedLocation.address); clearTempMarker(); }} className="py-2.5 bg-blue-50 text-blue-700 rounded-xl text-[9px] font-black uppercase tracking-tight active:bg-blue-100 transition-colors">Start Here</button>
              <button onClick={() => { setDestination(clickedLocation.address); clearTempMarker(); }} className="py-2.5 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-tight active:bg-blue-700 shadow-md shadow-blue-200">Go There</button>
            </div>
          </div>
        </div>
      )}

      {/* AI COACH FLOATING MESSAGE */}
      {aiCoachMsg && showAiCoach && (
        <div className="absolute top-24 left-4 z-50 max-w-[70%] animate-in fade-in slide-in-from-left-4 duration-500">
          <div className={`p-3 rounded-2xl shadow-xl flex gap-3 items-center border border-white/20 transition-all ${isSpeaking ? 'bg-blue-600 ring-4 ring-blue-500/30' : 'bg-slate-900/90 backdrop-blur-md'}`}>
            <div className={`p-2 rounded-full ${isSpeaking ? 'bg-white text-blue-600 animate-pulse' : 'bg-blue-600 text-white'}`}>
              <Volume2 size={14} />
            </div>
            <p className="text-[10px] font-bold text-white leading-snug pr-4">{aiCoachMsg}</p>
            <button onClick={() => { setShowAiCoach(false); window.speechSynthesis.cancel(); }} className="absolute -top-1 -right-1 p-1 bg-white/10 rounded-full text-white/40 hover:text-white"><X size={8}/></button>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET */}
      {!isSvActive && (
        <div className={`absolute bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-out ${panelOpen ? 'translate-y-0' : 'translate-y-[calc(100%-40px)]'}`}>
          <div className="bg-white rounded-t-[2.5rem] shadow-[0_-20px_40px_rgba(0,0,0,0.15)] p-5 border-t border-slate-100 max-h-[45vh] overflow-y-auto">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-5 cursor-pointer" onClick={() => setPanelOpen(!panelOpen)} />

            {!route ? (
              <div className="space-y-4">
                <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                  {Object.values(TravelMode).map((m) => (
                    <button key={m} onClick={() => setMode(m)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${mode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>{m}</button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-2">
                    <input type="text" placeholder="Start from..." value={origin} onChange={(e) => setOrigin(e.target.value)} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-600 rounded-xl py-3 px-4 text-slate-900 font-bold text-[11px] outline-none transition-all" />
                    <input type="text" placeholder="Destination..." value={destination} onChange={(e) => setDestination(e.target.value)} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-600 rounded-xl py-3 px-4 text-slate-900 font-bold text-[11px] outline-none transition-all" />
                  </div>
                  <button onClick={calculateRoute} disabled={loading || !origin || !destination} className="bg-blue-600 text-white font-black text-[12px] uppercase w-20 rounded-2xl shadow-lg active:scale-95 disabled:bg-slate-200 flex flex-col items-center justify-center gap-1">
                    {loading ? '...' : <><Navigation size={20} /> GO</>}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-3xl border border-slate-100">
                  <div>
                    <h2 className="text-slate-900 font-black text-2xl tracking-tighter leading-none mb-1">{route.distance}</h2>
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{route.duration} • {mode}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handlePlayToggle} className={`w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center transition-all ${simulation.isActive ? 'bg-amber-100 text-amber-600 scale-95' : 'bg-blue-600 text-white active:scale-90'}`}>
                      {simulation.isActive ? <Square size={20} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                    </button>
                    <button onClick={clearMapOverlays} className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center"><X size={20} /></button>
                  </div>
                </div>

                <div className="h-20 w-full bg-slate-900 rounded-2xl p-2 relative shadow-2xl overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={route.elevation} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorElev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="elevation" stroke="#3b82f6" strokeWidth={2} fill="url(#colorElev)" isAnimationActive={false} />
                      <ReferenceLine x={Math.floor((simulation.currentIndex / route.path.length) * (route.elevation.length - 1))} stroke="#ffffff" strokeWidth={2} strokeDasharray="3 3" />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="absolute top-2 right-3 text-[8px] font-black text-white/50 uppercase tracking-widest">Elevation Profile</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isSvActive && (
        <button onClick={() => panorama.current.setVisible(false)} className="absolute top-6 right-6 z-[100] p-4 bg-red-500 text-white rounded-2xl shadow-2xl active:scale-90 flex items-center gap-2 font-black text-xs">
          <X size={20} /> EXIT
        </button>
      )}
    </div>
  );
};

export default App;
