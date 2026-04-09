import { fetchWithAuth } from '../utils/api';
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, Navigation, Mountain, Coffee, Star, Activity, Filter, Layers, TrendingUp, Search, Route, Upload, Download, ChevronUp, ChevronDown, ShoppingBag, Wrench, Fuel, Beer, Camera, Info, ExternalLink, Heart, Building2, Settings } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import { renderToString } from 'react-dom/server';
import { parseGPX, exportToGPX, ParsedRoute } from '../utils/GPXParser';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import RecommendButton from '../components/RecommendButton';
import { useSearchParams, Link } from 'react-router-dom';
import { POI, getMinDistanceToPolyline, fetchExternalPOIs, mapCategory } from '../utils/POIUtils';
import { useNotification } from '../contexts/NotificationContext';
import MapRating from '../components/reviews/MapRating';
import ReviewModal from '../components/reviews/ReviewModal';

// Fix for default marker icons in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createRouteIcon = (color: string, isSelected: boolean = false) => {
  const iconHtml = renderToString(
    <div 
      style={{ backgroundColor: color }} 
      className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-white transition-all duration-300 ${
        isSelected ? 'scale-125 ring-4 ring-white/30 animate-pulse' : ''
      }`}
    >
      <Route className="w-4 h-4 text-white" />
    </div>
  );

  return L.divIcon({
    html: iconHtml,
    className: 'custom-leaflet-icon bg-transparent border-none',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

function MapUpdater({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
}

export default function RoadsDiscovery() {
  const { t } = useLanguage();
  const { showNotification } = useNotification();
  const [searchParams] = useSearchParams();
  const routeIdFromUrl = searchParams.get('routeId');
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([36.2704, -121.8081]);
  const [mapZoom, setMapZoom] = useState(4);
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [predictedScore, setPredictedScore] = useState<{score: number, confidence: number} | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [nearbyPOIs, setNearbyPOIs] = useState<POI[]>([]);
  const [loadingPOIs, setLoadingPOIs] = useState(false);
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null);
  const [internalPOIs, setInternalPOIs] = useState<POI[]>([]);
  const [isPOIsCollapsed, setIsPOIsCollapsed] = useState(true);
  const [isDetailsCollapsed, setIsDetailsCollapsed] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedRouteForReview, setSelectedRouteForReview] = useState<any>(null);
  const [mapRefreshKey, setMapRefreshKey] = useState(0);

  // Static map data from Map.tsx (simulated internal source)
  const staticMapData = [
    {"name":"Moto City","category":"dealership","lat":-19.8882,"lng":-44.0121},
    {"name":"Valence Yamaha Barão","category":"dealership","lat":-19.9760,"lng":-43.9654},
    {"name":"Valence Yamaha Pedro II","category":"dealership","lat":-19.9047,"lng":-43.9556},
    {"name":"Valence Kawasaki","category":"dealership","lat":-19.9755,"lng":-43.9639},
    {"name":"Royal Enfield BHZ","category":"dealership","lat":-19.9769,"lng":-43.9635},
    {"name":"Ducati Belo Horizonte","category":"dealership","lat":-19.9778,"lng":-43.9648},
    {"name":"BMW Motorrad BH","category":"dealership","lat":-19.9598,"lng":-43.9394},
    {"name":"Triumph BH","category":"dealership","lat":-19.9475,"lng":-43.9512},
    {"name":"Harley-Davidson BH","category":"dealership","lat":-19.9751,"lng":-43.9659},
    {"name":"Honda By Moto Amazonas","category":"dealership","lat":-19.9362,"lng":-43.9618},
    {"name":"Honda By Moto Centro","category":"dealership","lat":-19.9199,"lng":-43.9370},
    {"name":"Moto Roma Yamaha","category":"dealership","lat":-19.9220,"lng":-43.9403},
    {"name":"Banzai Honda Pampulha","category":"dealership","lat":-19.8621,"lng":-43.9651},
    {"name":"Minas Motos","category":"dealership","lat":-19.9191,"lng":-43.9355},
    {"name":"Moto Street Raja","category":"gear_shop","lat":-19.9564,"lng":-43.9609},
    {"name":"Motofort Racing","category":"gear_shop","lat":-19.9068,"lng":-43.9644},
    {"name":"RC1 Motos","category":"gear_shop","lat":-19.9360,"lng":-43.9376},
    {"name":"RioSul Motos","category":"parts_store","lat":-19.9188,"lng":-43.9373},
    {"name":"Moto Alfa Centro","category":"parts_store","lat":-19.9189,"lng":-43.9368},
    {"name":"WDA Motos","category":"parts_store","lat":-19.9190,"lng":-43.9365},
    {"name":"BH Motoracing","category":"workshop","lat":-19.9757,"lng":-43.9738},
    {"name":"Oficina Duas Rodas BH","category":"workshop","lat":-19.9342,"lng":-43.9411},
    {"name":"Garage Moto Service","category":"workshop","lat":-19.9281,"lng":-43.9487},
    {"name":"Oficina Moto Prime","category":"workshop","lat":-19.9004,"lng":-43.9600},
    {"name":"Moto Fix BH","category":"workshop","lat":-19.9194,"lng":-43.9482},
    {"name":"Moto Garage 82","category":"workshop","lat":-19.9488,"lng":-43.9453},
    {"name":"Savassi Moto Point","category":"meeting_spot","lat":-19.9366,"lng":-43.9380},
    {"name":"Praça da Liberdade Biker Point","category":"meeting_spot","lat":-19.9321,"lng":-43.9378},
    {"name":"Mineirão Parking Biker Meet","category":"meeting_spot","lat":-19.8659,"lng":-43.9711},
    {"name":"Lagoa da Pampulha Ride Spot","category":"ride_spot","lat":-19.8587,"lng":-43.9722},
    {"name":"Serra do Curral Viewpoint","category":"ride_spot","lat":-19.9563,"lng":-43.9134},
    {"name":"Praça do Papa","category":"ride_spot","lat":-19.9639,"lng":-43.9131},
    {"name":"Mirante Mangabeiras","category":"ride_spot","lat":-19.9624,"lng":-43.9155},
    {"name":"BH Riders Café","category":"biker_cafe","lat":-19.9440,"lng":-43.9398},
    {"name":"Moto Rock Bar","category":"biker_bar","lat":-19.9368,"lng":-43.9405},
    {"name":"Route 66 BH Bar","category":"biker_bar","lat":-19.9352,"lng":-43.9389},
    {"name":"BR040 Biker Stop","category":"ride_stop","lat":-19.9150,"lng":-44.0300},
    {"name":"MG030 Scenic Stop","category":"ride_stop","lat":-19.9700,"lng":-43.8500},
    {"name":"Serra da Moeda Lookout","category":"ride_spot","lat":-20.0500,"lng":-43.9800},
    {"name":"Top of the Mountain Route","category":"ride_spot","lat":-20.0600,"lng":-43.9700},
    {"name":"Casa Branca Biker Stop","category":"ride_stop","lat":-20.0830,"lng":-43.9950},
    {"name":"Macacos Village Biker Stop","category":"ride_stop","lat":-19.9660,"lng":-43.8500},
  ];

  useEffect(() => {
    // Fetch ecosystems and combine with static map data
    fetchWithAuth('/api/ecosystems')
      .then(res => res.json())
      .then(data => {
        const ecosystemPOIs: POI[] = data.map((e: any) => ({
          id: e.user_id,
          name: e.company_name,
          category: e.service_category?.toLowerCase() || 'other',
          lat: e.lat,
          lng: e.lng,
          source: 'ecosystem',
          profileUrl: `/profile/${e.username}`
        }));

        const internalPOIs: POI[] = staticMapData.map((p: any) => ({
          name: p.name,
          category: p.category,
          lat: p.lat,
          lng: p.lng,
          source: 'internal'
        }));

        setInternalPOIs([...ecosystemPOIs, ...internalPOIs]);
      })
      .catch(err => console.error("Failed to fetch ecosystems:", err));
  }, []);

  useEffect(() => {
    if (!selectedRoute) {
      setNearbyPOIs([]);
      setSelectedPOI(null);
      return;
    }

    const detectPOIs = async () => {
      setLoadingPOIs(true);
      const polyline = selectedRoute.polyline as [number, number][];
      
      // 1. Filter internal POIs near the route
      const filteredInternal = internalPOIs.map(poi => ({
        ...poi,
        distanceFromRoute: getMinDistanceToPolyline(poi, polyline)
      })).filter(poi => poi.distanceFromRoute! <= 15 && poi.name && poi.name.trim() !== '' && poi.name !== 'Unnamed POI'); // 15km corridor

      // 2. Fetch external POIs from OSM
      const external = await fetchExternalPOIs(polyline, 5);
      const filteredExternal = external.map(poi => ({
        ...poi,
        category: mapCategory(poi.category),
        distanceFromRoute: getMinDistanceToPolyline(poi, polyline)
      })).filter(poi => poi.distanceFromRoute! <= 5 && poi.name && poi.name.trim() !== '' && poi.name !== 'Unnamed POI'); // 5km corridor

      setNearbyPOIs([...filteredInternal, ...filteredExternal].sort((a, b) => (a.distanceFromRoute || 0) - (b.distanceFromRoute || 0)));
      setLoadingPOIs(false);
    };

    detectPOIs();
  }, [selectedRoute, internalPOIs]);

  const getPOIIcon = (category: string, source: string) => {
    const config: Record<string, { color: string, icon: any }> = {
      'dealership': { color: '#3b82f6', icon: <Building2 className="w-4 h-4 text-white" /> },
      'gear_shop': { color: '#10b981', icon: <ShoppingBag className="w-4 h-4 text-white" /> },
      'parts_store': { color: '#eab308', icon: <Settings className="w-4 h-4 text-white" /> },
      'workshop': { color: '#f97316', icon: <Wrench className="w-4 h-4 text-white" /> },
      'biker_cafe': { color: '#a8a29e', icon: <Coffee className="w-4 h-4 text-white" /> },
      'biker_bar': { color: '#ef4444', icon: <Beer className="w-4 h-4 text-white" /> },
      'gas_station': { color: '#f59e0b', icon: <Fuel className="w-4 h-4 text-white" /> },
      'parking': { color: '#64748b', icon: <MapPin className="w-4 h-4 text-white" /> },
      'viewpoint': { color: '#ec4899', icon: <Camera className="w-4 h-4 text-white" /> },
      'mountain_pass': { color: '#8b5cf6', icon: <Mountain className="w-4 h-4 text-white" /> },
      'rest_stop': { color: '#14b8a6', icon: <Info className="w-4 h-4 text-white" /> },
      'other': { color: '#94a3b8', icon: <MapPin className="w-4 h-4 text-white" /> }
    };

    const c = config[category] || config['other'];
    const iconHtml = renderToString(
      <div 
        style={{ backgroundColor: c.color }} 
        className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 ${source === 'ecosystem' ? 'border-primary' : 'border-white'} transition-all hover:scale-110`}
      >
        {c.icon}
      </div>
    );

    return L.divIcon({
      html: iconHtml,
      className: 'custom-leaflet-icon bg-transparent border-none',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    });
  };

  useEffect(() => {
    fetchWithAuth('/api/roads')
      .then(res => res.json())
      .then(data => {
        setRoutes(data);
        setLoading(false);
        
        if (routeIdFromUrl) {
          const route = data.find((r: any) => r.route_id === routeIdFromUrl || r.id === routeIdFromUrl);
          if (route) {
            setSelectedRoute(route);
            setMapCenter([route.start_point.lat, route.start_point.lng]);
            setMapZoom(12);
            setShowDetails(true);
          }
        }
      })
      .catch(err => {
        console.error("Failed to fetch routes:", err);
        setLoading(false);
      });
  }, [routeIdFromUrl]);

  const filteredRoutes = routes.filter(route => {
    const matchesFilter = activeFilter === 'all' || route.tags.includes(activeFilter);
    const matchesSearch = route.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          route.tags.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const getScoreColor = (score: number) => {
    if (score >= 95) return '#10b981'; // emerald-500
    if (score >= 85) return '#f59e0b'; // accent
    return '#ef4444'; // red-500
  };

  const handleRouteClick = (route: any) => {
    setSelectedRoute(route);
    setMapCenter([route.start_point.lat, route.start_point.lng]);
    setMapZoom(12);
    setPredictedScore(null);
    setShowDetails(false);
  };

  const getPOIDirectionsUrl = (poi: POI) => {
    let destination = '';
    if (poi.name && poi.name !== 'Unnamed POI') {
      destination = poi.name;
    } else {
      destination = `${poi.lat},${poi.lng}`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  };

  const handlePredictScore = async () => {
    if (!selectedRoute) return;
    setPredicting(true);
    try {
      const res = await fetchWithAuth('/api/roads/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedRoute.metrics)
      });
      const data = await res.json();
      setPredictedScore({ score: data.predicted_score, confidence: data.confidence });
    } catch (err) {
      console.error("Failed to predict score:", err);
    } finally {
      setPredicting(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newRoutes: ParsedRoute[] = [];
    let hasError = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) {
        showNotification('error', t('discover.import.sizeError').replace('{name}', file.name));
        continue;
      }

      try {
        const parsedRoute = await parseGPX(file);
        newRoutes.push(parsedRoute);
      } catch (error) {
        console.error(`Error parsing GPX ${file.name}:`, error);
        hasError = true;
      }
    }

    if (newRoutes.length > 0) {
      setRoutes(prev => [...newRoutes, ...prev]);
      handleRouteClick(newRoutes[0]); // Select the first uploaded route
    }

    if (hasError) {
      showNotification('error', t('discover.import.error'));
    }

    // Reset input
    event.target.value = '';
  };

  const handleExportGPX = () => {
    if (!selectedRoute) return;
    
    const gpxData = exportToGPX(selectedRoute);
    const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedRoute.name.replace(/\s+/g, '_')}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSendToGoogleMaps = () => {
    if (!selectedRoute) return;
    const polyline = selectedRoute.polyline as [number, number][];
    if (!polyline || polyline.length === 0) return;
    
    const start = polyline[0];
    const end = polyline[polyline.length - 1];
    
    const waypoints = [];
    if (polyline.length > 2) {
      const step = Math.max(1, Math.floor(polyline.length / 8));
      for (let i = step; i < polyline.length - 1; i += step) {
        waypoints.push(`${polyline[i][0]},${polyline[i][1]}`);
      }
    }
    
    const waypointsStr = waypoints.length > 0 ? `&waypoints=${waypoints.join('|')}` : '';
    const url = `https://www.google.com/maps/dir/?api=1&origin=${start[0]},${start[1]}&destination=${end[0]},${end[1]}${waypointsStr}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const handleSendToWaze = () => {
    if (!selectedRoute) return;
    const polyline = selectedRoute.polyline as [number, number][];
    if (!polyline || polyline.length === 0) return;
    
    const end = polyline[polyline.length - 1];
    const url = `https://waze.com/ul?ll=${end[0]},${end[1]}&navigate=yes`;
    window.open(url, '_blank');
  };

  return (
    <div className="h-[calc(100dvh-5rem)] sm:h-[calc(100dvh-5rem)] pt-4 flex flex-col md:flex-row bg-asphalt relative z-0">
      {/* Sidebar */}
      <div className="w-full md:w-[400px] mt-4 md:mt-0 flex-1 md:flex-none bg-carbon/50 border-r border-white/5 flex flex-col overflow-hidden z-20 order-last md:order-first rounded-tl-2xl">
        <div className="p-6 border-b border-white/5 bg-asphalt/50">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-xl font-display font-black uppercase italic tracking-tight">{t('roads.title')}</h1>
            </div>
            
            <label className="cursor-pointer bg-carbon hover:bg-engine text-white p-2 rounded-xl border border-white/10 transition-colors flex items-center gap-2" title={t('roads.import.btn')}>
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline text-[10px] font-mono uppercase tracking-widest">{t('roads.import.btn')}</span>
              <input 
                type="file" 
                accept=".gpx" 
                multiple
                className="hidden" 
                onChange={handleFileUpload}
              />
            </label>
          </div>
          <p className="text-xs text-steel font-mono uppercase tracking-widest mb-6">{t('roads.subtitle')}</p>

          {/* Search & Filters */}
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel" />
              <input 
                type="text" 
                value={searchQuery || ''}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('roads.search')}
                className="w-full bg-carbon border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all', label: t('roads.filter.all'), icon: Layers },
                { id: 'twisty', label: t('roads.filter.twisty'), icon: Activity },
                { id: 'scenic', label: t('roads.filter.scenic'), icon: Mountain },
                { id: 'legendary', label: t('roads.filter.legendary'), icon: Star },
                { id: 'hidden', label: t('roads.filter.hidden'), icon: MapPin }
              ].map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all ${
                    activeFilter === filter.id 
                      ? 'bg-primary text-asphalt font-bold' 
                      : 'bg-engine text-steel hover:bg-carbon hover:text-white'
                  }`}
                >
                  <filter.icon className="w-3 h-3" />
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Route List */}
        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4 custom-scrollbar">
          {filteredRoutes.map(route => (
            <motion.div
              key={route.route_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => handleRouteClick(route)}
              onMouseEnter={() => setHoveredRouteId(route.route_id)}
              onMouseLeave={() => setHoveredRouteId(null)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                selectedRoute?.route_id === route.route_id || hoveredRouteId === route.route_id
                  ? 'bg-primary/10 border-primary shadow-lg shadow-primary/5'
                  : 'bg-carbon border-white/5 hover:border-white/20 hover:bg-engine'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-bold text-sm text-white leading-tight pr-4">{route.name}</h3>
                <div 
                  className="flex items-center justify-center w-8 h-8 rounded-full font-mono font-bold text-xs shrink-0"
                  style={{ backgroundColor: `${getScoreColor(route.road_score)}20`, color: getScoreColor(route.road_score) }}
                >
                  {Math.round(route.road_score)}
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-4 text-xs text-steel font-mono">
                  <span className="flex items-center gap-1"><Navigation className="w-3 h-3" /> {route.distance_km} km</span>
                  <span className="uppercase tracking-widest text-[10px] bg-asphalt px-2 py-0.5 rounded-md border border-white/5">{t('roads.filter.' + route.difficulty.toLowerCase()) || route.difficulty}</span>
                </div>
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  <MapRating 
                    type="route" 
                    id={route.route_id} 
                    refreshTrigger={mapRefreshKey}
                    onClick={() => {
                      setSelectedRouteForReview(route);
                      setReviewModalOpen(true);
                    }} 
                  />
                  <RecommendButton 
                    item_id={route.route_id} 
                    item_name={route.name} 
                    type="road" 
                    item_description={`${route.distance_km}km • ${route.difficulty} • Score: ${Math.round(route.road_score)}/100`}
                    className="flex items-center gap-1 text-primary hover:text-oil font-display font-bold text-[10px] uppercase tracking-widest transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {route.tags.map(tag => (
                  <span key={tag} className="text-[9px] uppercase tracking-widest font-bold text-steel bg-asphalt px-1.5 py-0.5 rounded">
                    #{tag}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Route Details Box (Moved to Sidebar) */}
        {selectedRoute && (
          <div className="bg-carbon/50 border-t border-white/10 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold truncate">{selectedRoute.name}</h2>
              <button 
                onClick={() => setSelectedRoute(null)}
                className="w-6 h-6 flex items-center justify-center rounded-full bg-carbon text-steel hover:text-white hover:bg-engine transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-steel">
                  <span>{selectedRoute.distance_km} km</span>
                  <span>•</span>
                  <span className="uppercase">{t('roads.filter.' + selectedRoute.difficulty.toLowerCase()) || selectedRoute.difficulty}</span>
                </div>
              </div>
              <div className="text-right">
                {predictedScore ? (
                  <>
                    <div className="text-2xl font-display font-black text-primary">
                      {predictedScore.score}
                    </div>
                    <div className="text-[9px] font-mono uppercase tracking-widest text-primary">{t('roads.aiScore')}</div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-display font-black" style={{ color: getScoreColor(selectedRoute.road_score) }}>
                      {selectedRoute.road_score}
                    </div>
                    <div className="text-[9px] font-mono uppercase tracking-widest text-steel">{t('roads.score')}</div>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1.5 mb-4">
              {[
                { label: t('roads.metrics.curvature'), value: selectedRoute.metrics.curvature, icon: Activity },
                { label: t('roads.metrics.elevation'), value: selectedRoute.metrics.elevation, icon: Mountain },
                { label: t('roads.metrics.scenic'), value: selectedRoute.metrics.scenic, icon: MapPin },
                { label: t('roads.metrics.stops'), value: selectedRoute.metrics.stops, icon: Coffee },
                { label: t('roads.metrics.popular'), value: selectedRoute.metrics.popularity, icon: TrendingUp },
              ].map(metric => (
                <div key={metric.label} className="bg-carbon rounded-lg p-1.5 text-center border border-white/5">
                  <metric.icon className="w-3 h-3 mx-auto mb-0.5 text-steel" />
                  <div className="text-xs font-bold text-white mb-0">{metric.value}</div>
                  <div className="text-[7px] font-mono uppercase tracking-widest text-steel">{metric.label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button 
                  onClick={handleExportGPX}
                  className="flex-1 bg-carbon hover:bg-engine text-white font-mono uppercase tracking-widest text-[10px] py-2 rounded-lg border border-white/10 transition-colors flex items-center justify-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  GPX
                </button>
                <button 
                  onClick={handlePredictScore}
                  disabled={predicting || !!predictedScore}
                  className="flex-1 bg-carbon hover:bg-engine text-white font-mono uppercase tracking-widest text-[10px] py-2 rounded-lg border border-white/10 transition-colors disabled:opacity-50"
                >
                  {predicting ? '...' : predictedScore ? t('roads.analyzed') : t('roads.aiScore')}
                </button>
                <RecommendButton 
                  item_id={selectedRoute.route_id || selectedRoute.id} 
                  item_name={selectedRoute.name} 
                  type="road" 
                  item_description={`${selectedRoute.distance_km}km • ${selectedRoute.difficulty} • Score: ${Math.round(selectedRoute.road_score)}/100`}
                  className="flex-1 btn-primary py-2 text-[10px] flex items-center justify-center gap-1"
                />
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleSendToGoogleMaps}
                  className="flex-1 bg-carbon hover:bg-engine text-white font-mono uppercase tracking-widest text-[10px] py-2 rounded-lg border border-white/10 transition-colors flex items-center justify-center gap-1"
                >
                  <MapPin className="w-3 h-3" />
                  Google Maps
                </button>
                <button 
                  onClick={handleSendToWaze}
                  className="flex-1 bg-carbon hover:bg-engine text-white font-mono uppercase tracking-widest text-[10px] py-2 rounded-lg border border-white/10 transition-colors flex items-center justify-center gap-1"
                >
                  <Navigation className="w-3 h-3" />
                  Waze
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* End of Sidebar */}

      {/* Map Area */}
      <div className="flex-1 relative mt-4 md:mt-0 z-10 order-first md:order-last rounded-tr-2xl overflow-hidden">
        <MapContainer 
          center={mapCenter} 
          zoom={mapZoom} 
          className="w-full h-full z-10"
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <MapUpdater center={mapCenter} zoom={mapZoom} />
          
          {/* POI Markers */}
          {nearbyPOIs.map((poi, idx) => (
            <Marker 
              key={`${poi.name}-${idx}`}
              position={[poi.lat, poi.lng]}
              icon={getPOIIcon(poi.category, poi.source)}
              eventHandlers={{
                click: () => setSelectedPOI(poi)
              }}
            >
              <Popup className="custom-popup">
                <div className="p-3 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-mono font-black uppercase tracking-widest text-steel bg-chrome px-2 py-0.5 rounded">
                      {t('category.' + poi.category)}
                    </span>
                    {poi.source === 'ecosystem' && (
                      <span className="text-[10px] font-mono font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {t('roads.poi.ecosystem')}
                      </span>
                    )}
                  </div>
                  <h4 className="font-display font-black uppercase italic text-asphalt text-lg leading-tight mb-1">{poi.name}</h4>
                  <p className="text-[10px] font-mono text-steel mb-3">
                    {poi.distanceFromRoute?.toFixed(1)} {t('roads.poi.distance')}
                  </p>
                  
                  <div className="flex gap-2">
                    {poi.profileUrl ? (
                      <Link 
                        to={poi.profileUrl}
                        className="flex-1 bg-primary text-asphalt text-[10px] font-mono font-bold uppercase tracking-widest py-2 rounded-lg text-center hover:bg-oil transition-all"
                      >
                        {t('roads.poi.profile')}
                      </Link>
                    ) : (
                      <button 
                        onClick={() => window.open(getPOIDirectionsUrl(poi), '_blank')}
                        className="flex-1 bg-asphalt text-white text-[10px] font-mono font-bold uppercase tracking-widest py-2 rounded-lg hover:bg-primary hover:text-asphalt transition-all"
                      >
                        {t('roads.poi.navigate')}
                      </button>
                    )}
                    <button className="p-2 bg-chrome text-steel rounded-lg hover:text-primary transition-colors">
                      <Heart className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
          
          {filteredRoutes.map(route => (
            <React.Fragment key={route.route_id}>
              <Polyline 
                positions={route.polyline as [number, number][]} 
                color={getScoreColor(route.road_score)}
                weight={selectedRoute?.route_id === route.route_id || hoveredRouteId === route.route_id ? 6 : 3}
                opacity={selectedRoute?.route_id === route.route_id || hoveredRouteId === route.route_id ? 1 : 0.6}
                eventHandlers={{
                  click: () => handleRouteClick(route),
                  mouseover: () => setHoveredRouteId(route.route_id),
                  mouseout: () => setHoveredRouteId(null),
                }}
              />
              <Marker 
                position={[route.start_point.lat, route.start_point.lng]} 
                icon={createRouteIcon(getScoreColor(route.road_score), selectedRoute?.route_id === route.route_id || hoveredRouteId === route.route_id)}
                eventHandlers={{
                  click: () => handleRouteClick(route),
                  mouseover: () => setHoveredRouteId(route.route_id),
                  mouseout: () => setHoveredRouteId(null),
                }}
              >
                <Popup className="custom-popup">
                  <div className="p-2 min-w-[180px]">
                    <h4 className="font-display font-black uppercase italic text-asphalt leading-none tracking-tight mb-2">{route.name}</h4>
                    <div className="flex items-center gap-2 mb-3">
                      <div 
                        className="flex items-center justify-center w-6 h-6 rounded-full font-mono font-bold text-[10px] shrink-0"
                        style={{ backgroundColor: `${getScoreColor(route.road_score)}20`, color: getScoreColor(route.road_score) }}
                      >
                        {Math.round(route.road_score)}
                      </div>
                      <span className="text-[10px] font-mono font-bold text-steel uppercase tracking-widest">{t('roads.filter.' + route.difficulty.toLowerCase()) || route.difficulty}</span>
                      <MapRating 
                        type="route" 
                        id={route.route_id} 
                        refreshTrigger={mapRefreshKey}
                        onClick={() => {
                          setSelectedRouteForReview(route);
                          setReviewModalOpen(true);
                        }} 
                      />
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRouteClick(route);
                        setShowDetails(true);
                      }}
                      className="w-full bg-asphalt text-white text-[10px] font-mono font-bold uppercase tracking-widest py-2 rounded-lg hover:bg-primary hover:text-asphalt transition-all shadow-lg"
                    >
                      {t('roads.btn.details')}
                    </button>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          ))}
        </MapContainer>
      </div>
      {selectedRouteForReview && (
        <ReviewModal
          isOpen={reviewModalOpen}
          onClose={() => {
            setReviewModalOpen(false);
            setSelectedRouteForReview(null);
          }}
          target_type="route"
          target_id={selectedRouteForReview.route_id}
          target_name={selectedRouteForReview.name}
          onReviewAdded={() => setMapRefreshKey(prev => prev + 1)}
        />
      )}
    </div>
  );
}
