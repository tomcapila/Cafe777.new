import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Route as RouteIcon, ArrowLeft, Plus, Lock } from 'lucide-react';
import { fetchWithAuth } from '../utils/api';
import { useLanguage } from '../contexts/LanguageContext';
import RelatoCard from '../components/RelatoCard';

const pin = (color: string) =>
  L.divIcon({ className: '', html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });

export default function RouteDetail() {
  const { routeId } = useParams();
  const { t } = useLanguage();
  const [route, setRoute] = useState<any>(null);
  const [relatos, setRelatos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!routeId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchWithAuth(`/api/routes/${encodeURIComponent(routeId)}`);
        if (res.ok) {
          const d = await res.json();
          setRoute(d.route);
          setRelatos(d.relatos || []);
        } else if (res.status === 403) {
          setError(t('route.private'));
        } else {
          setError(t('route.notFound'));
        }
      } catch (e) {
        setError(t('route.notFound'));
      } finally {
        setLoading(false);
      }
    })();
  }, [routeId]);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-steel/20 border-t-primary rounded-full animate-spin" /></div>;
  }
  if (error || !route) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center text-steel flex flex-col items-center gap-3"><Lock className="w-8 h-8" />{error || t('route.notFound')}</div>;
  }

  const poly: [number, number][] = Array.isArray(route.polyline) ? route.polyline : [];
  const start = route.geometry?.start;
  const end = route.geometry?.end;
  const waypoints: any[] = Array.isArray(route.geometry?.waypoints) ? route.geometry.waypoints : [];
  const center: [number, number] = start ? [start.lat, start.lng] : (poly[0] || [-19.92, -43.94]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <Link to="/roads" className="inline-flex items-center gap-2 text-steel hover:text-primary text-sm">
        <ArrowLeft className="w-4 h-4" /> {t('route.back')}
      </Link>

      <header className="glass-card p-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-display font-black uppercase italic tracking-tighter text-primary break-words flex items-center gap-2">
              <RouteIcon className="w-7 h-7 shrink-0" /> {route.name}
            </h1>
            <div className="text-sm text-steel mt-1 flex flex-wrap items-center gap-2">
              {route.distanceMeters ? <span>{(route.distanceMeters / 1000).toFixed(1)} km</span> : null}
              {route.difficulty && <span className="badge-chrome">{route.difficulty}</span>}
              <span className="badge-chrome inline-flex items-center gap-1"><Lock className="w-3 h-3" /> {route.privacyLevel}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-display font-black text-chrome">{relatos.length}</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-steel">{t('place.reports')}</div>
          </div>
        </div>

        <div className="h-64 rounded-xl overflow-hidden border border-asphalt/30">
          <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {poly.length > 1 && <Polyline positions={poly} pathOptions={{ color: '#FF5500', weight: 4 }} />}
            {start && <Marker position={[start.lat, start.lng]} icon={pin('#22c55e')} />}
            {end && <Marker position={[end.lat, end.lng]} icon={pin('#ef4444')} />}
            {waypoints.map((w, i) => (
              <Marker key={i} position={[w.lat, w.lng]} icon={pin('#FF5500')} />
            ))}
          </MapContainer>
        </div>

        <Link
          to={`/relatos/new?routeId=${encodeURIComponent(route.id)}&routeName=${encodeURIComponent(route.name)}`}
          className="btn-primary inline-flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" /> {t('route.addReport')}
        </Link>
      </header>

      {relatos.length === 0 ? (
        <div className="glass-card p-10 text-center text-steel">{t('place.empty')}</div>
      ) : (
        <div className="space-y-5">
          {relatos.map((r) => (
            <RelatoCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}
