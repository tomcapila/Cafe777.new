import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  MapPin, Search, LocateFixed, Save, Send, Camera, X, Bike, ShieldCheck, Loader2, Plus, Check, Upload,
} from 'lucide-react';
import { fetchWithAuth } from '../utils/api';
import { useLanguage } from '../contexts/LanguageContext';
import { useNotification } from '../contexts/NotificationContext';
import { SURFACE, SUITABILITY, TRISTATE, AMENITIES, type Opt } from '../utils/relatoLabels';
import { parseGPX } from '../utils/GPXParser';

// ---- Types -----------------------------------------------------------------
type PlaceHit = { placeId: string; name: string; lat: number; lng: number; category?: string | null; address?: string | null };
type DedupHit = { placeId: string; name: string; distanceMeters: number; score: number };
type Moto = { id: number; make: string; model: string; year?: number; image_url?: string | null };
type MediaItem = { type: 'photo'; url: string };
type Coords = { lat: number; lng: number; accuracy?: number };

// Moto-native field labels (SURFACE/SUITABILITY/TRISTATE/AMENITIES/Opt) come from
// ../utils/relatoLabels (shared with PlaceDetail).

const DEFAULT_CENTER: [number, number] = [-19.9208, -43.9378]; // Belo Horizonte

function pinIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="width:20px;height:20px;border-radius:50%;background:var(--color-primary,#680A08);border:3px solid #fff;box-shadow:0 0 0 2px var(--color-primary,#680A08)"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// Route point markers: green start, red end, primary for waypoints.
function routePinIcon(index: number, total: number) {
  const color = index === 0 ? '#22c55e' : index === total - 1 ? '#ef4444' : 'var(--color-primary,#680A08)';
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// Captures clicks on the Leaflet map to drop the new-place pin.
function MapClickCapture({ onPick }: { onPick: (c: Coords) => void }): null {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export default function CreateRelato() {
  const { t, language } = useLanguage();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');

  const label = (o: Opt) => (language === 'pt' ? o.pt : o.en);

  // Anchor
  const [anchorMode, setAnchorMode] = useState<'existing' | 'new'>('existing');
  const [anchorLocked, setAnchorLocked] = useState(false); // true when resuming/editing
  const [lockedAnchorLabel, setLockedAnchorLabel] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<PlaceHit[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceHit | null>(null);
  const [newPlaceName, setNewPlaceName] = useState('');
  const [newPlaceCoords, setNewPlaceCoords] = useState<Coords | null>(null);
  const [dedupHits, setDedupHits] = useState<DedupHit[]>([]);

  // Route anchor (Fase 5)
  const [anchorKind, setAnchorKind] = useState<'place' | 'route'>('place');
  const [routeName, setRouteName] = useState('');
  const [routePoints, setRoutePoints] = useState<Coords[]>([]);
  const [routeDifficulty, setRouteDifficulty] = useState<'' | 'leve' | 'media' | 'pesada'>('');
  const [routePrivacy, setRoutePrivacy] = useState<'public' | 'community' | 'private'>('private');
  const [gpxImported, setGpxImported] = useState(false);
  const [lockedRouteId, setLockedRouteId] = useState<string | null>(null);

  // Narrative
  const [title, setTitle] = useState('');
  const [motivacao, setMotivacao] = useState('');
  const [recepcao, setRecepcao] = useState('');
  const [paraQuem, setParaQuem] = useState('');
  const [atencao, setAtencao] = useState('');
  const [freeBody, setFreeBody] = useState('');

  // Structured fields (moto-native attributes of the place)
  const [sf, setSf] = useState<Record<string, any>>({});

  // Media
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Moto picker
  const [motos, setMotos] = useState<Moto[]>([]);
  const [motoId, setMotoId] = useState('');

  // External link (single, optional)
  const [linkUrl, setLinkUrl] = useState('');

  // Presence proof
  const [evidenceCoords, setEvidenceCoords] = useState<Coords | null>(null);

  const [loadedStatus, setLoadedStatus] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // --- Load garage (moto picker) + draft (when ?id=) ---
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem('user');
        if (raw) {
          const u = JSON.parse(raw);
          if (u?.username) {
            const res = await fetchWithAuth(`/api/profile/${encodeURIComponent(u.username)}`);
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data.garage)) setMotos(data.garage);
            }
          }
        }
      } catch (e) { /* picker is optional */ }
    })();
  }, []);

  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/relatos/${editId}`);
        if (!res.ok) { showNotification('error', t('relato.notification.loadFailed')); return; }
        const r = await res.json();
        setAnchorLocked(true);
        setLoadedStatus(r.status || '');
        setLockedAnchorLabel(r.anchorType === 'route' ? t('relato.anchor.route') : (r.anchorId || ''));
        setTitle(r.title || '');
        if (r.narrativeParts) {
          setMotivacao(r.narrativeParts.motivacao || '');
          setRecepcao(r.narrativeParts.recepcao || '');
          setParaQuem(r.narrativeParts.paraQuem || '');
          setAtencao(r.narrativeParts.atencao || '');
        } else {
          setFreeBody(r.body || '');
        }
        if (r.structuredFields) setSf(r.structuredFields);
        if (Array.isArray(r.media)) setMedia(r.media);
        if (r.motoUsed?.motoId) setMotoId(String(r.motoUsed.motoId));
        if (Array.isArray(r.externalLinks) && r.externalLinks[0]?.url) setLinkUrl(r.externalLinks[0].url);
      } catch (e) {
        showNotification('error', t('relato.notification.loadFailed'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // Deep-link from a place page: /relatos/new?placeId=...&placeName=...
  useEffect(() => {
    const pid = searchParams.get('placeId');
    const pname = searchParams.get('placeName');
    if (pid && !editId) {
      setAnchorMode('existing');
      setSelectedPlace({ placeId: pid, name: pname || pid, lat: 0, lng: 0 });
      setPlaceQuery(pname || '');
    }
    const rid = searchParams.get('routeId');
    const rname = searchParams.get('routeName');
    if (rid && !editId) {
      setAnchorKind('route');
      setAnchorLocked(true);
      setLockedRouteId(rid);
      setLockedAnchorLabel(rname || rid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Debounced place search (existing anchor) ---
  useEffect(() => {
    if (anchorMode !== 'existing' || anchorLocked) return;
    const q = placeQuery.trim();
    if (q.length < 2) { setPlaceResults([]); return; }
    const handle = setTimeout(async () => {
      try {
        const res = await fetchWithAuth(`/api/relatos/places/search?q=${encodeURIComponent(q)}`);
        if (res.ok) setPlaceResults(await res.json());
      } catch (e) { /* ignore */ }
    }, 350);
    return () => clearTimeout(handle);
  }, [placeQuery, anchorMode, anchorLocked]);

  // --- Debounced dedup (new place) ---
  useEffect(() => {
    if (anchorMode !== 'new' || anchorLocked) { setDedupHits([]); return; }
    const name = newPlaceName.trim();
    if (name.length < 2 || !newPlaceCoords) { setDedupHits([]); return; }
    const handle = setTimeout(async () => {
      try {
        const res = await fetchWithAuth(
          `/api/relatos/places/dedup?name=${encodeURIComponent(name)}&lat=${newPlaceCoords.lat}&lng=${newPlaceCoords.lng}`,
        );
        if (res.ok) setDedupHits(await res.json());
      } catch (e) { /* ignore */ }
    }, 450);
    return () => clearTimeout(handle);
  }, [newPlaceName, newPlaceCoords, anchorMode, anchorLocked]);

  const captureLocation = (target: 'newPlace' | 'evidence') => {
    if (!navigator.geolocation) { showNotification('warning', t('relato.notification.noGeo')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: Coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        if (target === 'newPlace') setNewPlaceCoords(c);
        setEvidenceCoords(c); // GPS at the spot doubles as presence proof
        showNotification('success', t('relato.notification.locationSet'));
      },
      () => showNotification('error', t('relato.notification.geoDenied')),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const onPickExisting = (p: PlaceHit) => {
    setSelectedPlace(p);
    setPlaceResults([]);
    setPlaceQuery(p.name);
  };

  const onPickDedup = (h: DedupHit) => {
    // "Did you mean?" → switch to existing place to avoid a duplicate.
    setAnchorMode('existing');
    setSelectedPlace({ placeId: h.placeId, name: h.name, lat: 0, lng: 0 });
    setPlaceQuery(h.name);
    setDedupHits([]);
    showNotification('info', t('relato.notification.usedExisting'));
  };

  const toggleAmenity = (val: string) => {
    setSf((prev) => {
      const cur: string[] = Array.isArray(prev.amenities) ? prev.amenities : [];
      const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val];
      return { ...prev, amenities: next };
    });
  };
  const setSingle = (key: string, val: string) =>
    setSf((prev) => ({ ...prev, [key]: prev[key] === val ? undefined : val }));

  const onUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    if (media.length >= 12) { showNotification('warning', t('relato.notification.maxPhotos')); return; }
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 12 - media.length)) {
        const fd = new FormData();
        fd.append('image', file);
        const res = await fetchWithAuth('/api/relatos/media', { method: 'POST', body: fd });
        if (res.ok) {
          const data = await res.json();
          if (data?.url) setMedia((m) => [...m, { type: 'photo', url: data.url }]);
        } else {
          showNotification('error', t('relato.notification.uploadFailed'));
        }
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // GPX import (Fase 5): populate the route geometry from a track. We do NOT use
  // live background GPS — only an imported file or map clicks.
  const onImportGpx = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const parsed = await parseGPX(file);
      const pts = parsed.points || [];
      if (pts.length < 2) { showNotification('warning', t('relato.route.gpxFail')); return; }
      const sampled: Coords[] = [{ lat: parsed.start_point.lat, lng: parsed.start_point.lng }];
      const step = Math.max(1, Math.floor(pts.length / 6));
      for (let i = step; i < pts.length - 1; i += step) sampled.push({ lat: pts[i].lat, lng: pts[i].lng });
      sampled.push({ lat: parsed.end_point.lat, lng: parsed.end_point.lng });
      setRoutePoints(sampled);
      setGpxImported(true);
      if (!routeName.trim() && parsed.name) setRouteName(parsed.name);
      showNotification('success', t('relato.route.gpxImported'));
    } catch (e) {
      showNotification('error', t('relato.route.gpxFail'));
    }
  };

  const buildNarrativeParts = () => {
    const parts: Record<string, string> = {};
    if (motivacao.trim()) parts.motivacao = motivacao.trim();
    if (recepcao.trim()) parts.recepcao = recepcao.trim();
    if (paraQuem.trim()) parts.paraQuem = paraQuem.trim();
    if (atencao.trim()) parts.atencao = atencao.trim();
    return Object.keys(parts).length ? parts : undefined;
  };

  const cleanedSf = useMemo(() => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(sf)) {
      if (v == null) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      out[k] = v;
    }
    return out;
  }, [sf]);

  const hasNarrative = !!(freeBody.trim() || motivacao.trim() || recepcao.trim() || paraQuem.trim() || atencao.trim());

  const validate = (): string | null => {
    if (!title.trim()) return t('relato.validation.title');
    if (!hasNarrative) return t('relato.validation.body');
    if (!anchorLocked) {
      if (anchorKind === 'place') {
        if (anchorMode === 'existing' && !selectedPlace) return t('relato.validation.place');
        if (anchorMode === 'new' && (!newPlaceName.trim() || !newPlaceCoords)) return t('relato.validation.newPlace');
      } else {
        if (!routeName.trim() || routePoints.length < 2) return t('relato.validation.route');
      }
    }
    return null;
  };

  const submit = async (requestedStatus: 'draft' | 'pending') => {
    const err = validate();
    if (err) { showNotification('warning', err); return; }
    setSubmitting(true);
    try {
      const links = linkUrl.trim()
        ? [{ kind: /maps\.app\.goo\.gl|goo\.gl|google\.[a-z.]+\/maps/i.test(linkUrl) ? 'gmaps' : 'website', url: linkUrl.trim() }]
        : undefined;
      const evidence = (anchorKind === 'route' && gpxImported)
        ? { gpxRef: 'gpx_import' }
        : (evidenceCoords ? { coords: evidenceCoords } : undefined);
      const narrativeParts = buildNarrativeParts();

      let res: Response;
      if (editId) {
        const body: Record<string, any> = {
          title: title.trim(),
          structuredFields: cleanedSf,
          media,
          motoUsed: motoId ? { motoId } : null,
          externalLinks: links || [],
          requestedStatus,
        };
        if (narrativeParts) body.narrativeParts = narrativeParts;
        else body.body = freeBody.trim();
        if (evidence) body.evidence = evidence;
        res = await fetchWithAuth(`/api/relatos/${editId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      } else {
        const body: Record<string, any> = {
          anchorType: anchorKind,
          title: title.trim(),
          structuredFields: cleanedSf,
          media,
          externalLinks: links,
          requestedStatus,
        };
        if (anchorKind === 'place') {
          if (anchorMode === 'existing' && selectedPlace) body.anchorId = selectedPlace.placeId;
          if (anchorMode === 'new' && newPlaceCoords) {
            body.newPlace = { name: newPlaceName.trim(), coords: { lat: newPlaceCoords.lat, lng: newPlaceCoords.lng }, motoAttributes: cleanedSf };
          }
        } else if (lockedRouteId) {
          body.anchorId = lockedRouteId;
        } else {
          body.newRoute = {
            name: routeName.trim(),
            start: { lat: routePoints[0].lat, lng: routePoints[0].lng },
            end: { lat: routePoints[routePoints.length - 1].lat, lng: routePoints[routePoints.length - 1].lng },
            waypoints: routePoints.slice(1, -1).map((p) => ({ lat: p.lat, lng: p.lng })),
            difficulty: routeDifficulty || undefined,
            privacyLevel: routePrivacy,
            gpxRef: gpxImported ? 'gpx_import' : undefined,
          };
        }
        if (narrativeParts) body.narrativeParts = narrativeParts;
        else if (freeBody.trim()) body.body = freeBody.trim();
        if (motoId) body.motoUsed = { motoId };
        if (evidence) body.evidence = evidence;
        res = await fetchWithAuth('/api/relatos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      }

      if (res.ok) {
        showNotification('success', requestedStatus === 'pending' ? t('relato.notification.submitted') : t('relato.notification.drafted'));
        navigate('/motorfeed');
      } else {
        const data = await res.json().catch(() => ({}));
        showNotification('error', data?.error || t('relato.notification.saveFailed'));
      }
    } catch (e) {
      showNotification('error', t('relato.notification.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const mapCenter: [number, number] = newPlaceCoords ? [newPlaceCoords.lat, newPlaceCoords.lng] : DEFAULT_CENTER;
  const routeCenter: [number, number] = routePoints[0] ? [routePoints[0].lat, routePoints[0].lng] : DEFAULT_CENTER;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-3xl font-display font-black uppercase italic tracking-tighter text-primary flex items-center gap-3">
          <MapPin className="w-7 h-7" /> {t('relato.create.title')}
        </h1>
        <p className="text-steel font-light mt-1">{t('relato.create.subtitle')}</p>
      </header>

      {/* 1. Anchor */}
      <section className="glass-card p-5 space-y-4">
        <h2 className="font-mono font-black uppercase tracking-widest text-xs text-steel">{t('relato.section.anchor')}</h2>

        {anchorLocked ? (
          <div className="flex items-center gap-2 text-chrome">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-sm break-all">{lockedAnchorLabel || t('relato.anchor.locked')}</span>
            {loadedStatus && <span className="badge-chrome ml-auto">{loadedStatus}</span>}
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAnchorKind('place')}
                className={anchorKind === 'place' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}>
                {t('relato.kind.place')}
              </button>
              <button type="button" onClick={() => setAnchorKind('route')}
                className={anchorKind === 'route' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}>
                {t('relato.kind.route')}
              </button>
            </div>

            {anchorKind === 'place' && (
            <div className="space-y-4">
            <div className="flex gap-2">
              <button type="button" onClick={() => setAnchorMode('existing')}
                className={anchorMode === 'existing' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}>
                {t('relato.anchor.existing')}
              </button>
              <button type="button" onClick={() => setAnchorMode('new')}
                className={anchorMode === 'new' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}>
                {t('relato.anchor.new')}
              </button>
            </div>

            {anchorMode === 'existing' && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-steel" />
                  <input className="input-field pl-9" placeholder={t('relato.place.searchPlaceholder')}
                    value={placeQuery} onChange={(e) => { setPlaceQuery(e.target.value); setSelectedPlace(null); }} />
                </div>
                {placeResults.length > 0 && (
                  <ul className="border border-asphalt/30 rounded-xl divide-y divide-asphalt/20 overflow-hidden">
                    {placeResults.map((p) => (
                      <li key={p.placeId}>
                        <button type="button" onClick={() => onPickExisting(p)}
                          className="w-full text-left px-3 py-2 hover:bg-primary/10 text-sm text-chrome">
                          <span className="font-semibold">{p.name}</span>
                          {p.address && <span className="block text-xs text-steel">{p.address}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedPlace && (
                  <div className="flex items-center gap-2 text-success text-sm">
                    <Check className="w-4 h-4" /> {selectedPlace.name}
                  </div>
                )}
              </div>
            )}

            {anchorMode === 'new' && (
              <div className="space-y-3">
                <input className="input-field" placeholder={t('relato.place.newNamePlaceholder')}
                  value={newPlaceName} onChange={(e) => setNewPlaceName(e.target.value)} />
                <button type="button" onClick={() => captureLocation('newPlace')}
                  className="btn-secondary flex items-center gap-2 text-sm">
                  <LocateFixed className="w-4 h-4" /> {t('relato.place.useLocation')}
                </button>
                <div className="h-56 rounded-xl overflow-hidden border border-asphalt/30">
                  <MapContainer center={mapCenter} zoom={newPlaceCoords ? 15 : 12} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <MapClickCapture onPick={(c) => setNewPlaceCoords(c)} />
                    {newPlaceCoords && <Marker position={[newPlaceCoords.lat, newPlaceCoords.lng]} icon={pinIcon()} />}
                  </MapContainer>
                </div>
                <p className="text-xs text-steel">{t('relato.place.mapHint')}</p>
                {dedupHits.length > 0 && (
                  <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 space-y-2">
                    <p className="text-xs font-mono font-black uppercase tracking-widest text-warning">{t('relato.place.dedupTitle')}</p>
                    {dedupHits.map((h) => (
                      <button key={h.placeId} type="button" onClick={() => onPickDedup(h)}
                        className="w-full text-left text-sm text-chrome hover:text-primary flex justify-between">
                        <span>{h.name}</span>
                        <span className="text-steel">{h.distanceMeters} m</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>
            )}

            {anchorKind === 'route' && (
              <div className="space-y-3">
                <input className="input-field" placeholder={t('relato.route.namePlaceholder')}
                  value={routeName} onChange={(e) => setRouteName(e.target.value)} />
                <div className="h-56 rounded-xl overflow-hidden border border-asphalt/30">
                  <MapContainer center={routeCenter} zoom={routePoints.length ? 11 : 6} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <MapClickCapture onPick={(c) => setRoutePoints((pts) => [...pts, c])} />
                    {routePoints.length > 1 && (
                      <Polyline positions={routePoints.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#FF5500', weight: 3, dashArray: '6' }} />
                    )}
                    {routePoints.map((p, i) => (
                      <Marker key={i} position={[p.lat, p.lng]} icon={routePinIcon(i, routePoints.length)} />
                    ))}
                  </MapContainer>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-steel">{t('relato.route.mapHint')}</span>
                  {routePoints.length > 0 && (
                    <button type="button" onClick={() => { setRoutePoints([]); setGpxImported(false); }} className="text-accent hover:text-primary">{t('relato.route.clear')}</button>
                  )}
                </div>
                <label className="btn-secondary flex items-center gap-2 text-sm cursor-pointer w-fit">
                  <Upload className="w-4 h-4" /> {t('relato.route.importGpx')}
                  <input type="file" accept=".gpx" className="hidden" onChange={(e) => onImportGpx(e.target.files)} />
                </label>
                {gpxImported && <p className="text-xs text-success flex items-center gap-1"><Check className="w-3 h-3" /> {t('relato.route.gpxImported')}</p>}
                <div className="flex gap-2 flex-wrap">
                  {(['leve', 'media', 'pesada'] as const).map((d) => (
                    <button key={d} type="button" onClick={() => setRouteDifficulty(routeDifficulty === d ? '' : d)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${routeDifficulty === d ? 'bg-primary text-inverse border-primary' : 'border-asphalt/40 text-steel'}`}>
                      {t(`relato.route.diff.${d}`)}
                    </button>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-semibold text-chrome mb-2">{t('relato.route.privacy')}</p>
                  <div className="flex gap-2 flex-wrap">
                    {(['private', 'community', 'public'] as const).map((p) => (
                      <button key={p} type="button" onClick={() => setRoutePrivacy(p)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${routePrivacy === p ? 'bg-primary text-inverse border-primary' : 'border-asphalt/40 text-steel'}`}>
                        {t(`relato.route.privacy.${p}`)}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-steel mt-1">{t('relato.route.privacyHint')}</p>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* 2. Narrative */}
      <section className="glass-card p-5 space-y-4">
        <h2 className="font-mono font-black uppercase tracking-widest text-xs text-steel">{t('relato.section.story')}</h2>
        <input className="input-field" placeholder={t('relato.field.titlePlaceholder')} value={title}
          maxLength={160} onChange={(e) => setTitle(e.target.value)} />
        <p className="text-xs text-steel">{t('relato.guided.hint')}</p>
        <textarea className="input-field resize-y" rows={2} placeholder={t('relato.guided.motivacao')} value={motivacao} onChange={(e) => setMotivacao(e.target.value)} />
        <textarea className="input-field resize-y" rows={2} placeholder={t('relato.guided.recepcao')} value={recepcao} onChange={(e) => setRecepcao(e.target.value)} />
        <textarea className="input-field resize-y" rows={2} placeholder={t('relato.guided.paraQuem')} value={paraQuem} onChange={(e) => setParaQuem(e.target.value)} />
        <textarea className="input-field resize-y" rows={2} placeholder={t('relato.guided.atencao')} value={atencao} onChange={(e) => setAtencao(e.target.value)} />
        <textarea className="input-field resize-y" rows={3} placeholder={t('relato.guided.free')} value={freeBody} onChange={(e) => setFreeBody(e.target.value)} />
      </section>

      {/* 3. Structured (moto-native place attributes) */}
      <section className="glass-card p-5 space-y-4">
        <h2 className="font-mono font-black uppercase tracking-widest text-xs text-steel">{t('relato.section.moto')}</h2>

        <ChipRow title={t('relato.sf.surface')} opts={SURFACE} value={sf.accessRoadSurface} onPick={(v) => setSingle('accessRoadSurface', v)} label={label} />
        <ChipRow title={t('relato.sf.suitability')} opts={SUITABILITY} value={sf.accessSuitability} onPick={(v) => setSingle('accessSuitability', v)} label={label} />
        <ChipRow title={t('relato.sf.parking')} opts={TRISTATE} value={sf.motoParking} onPick={(v) => setSingle('motoParking', v)} label={label} />
        <ChipRow title={t('relato.sf.gear')} opts={TRISTATE} value={sf.gearStorage} onPick={(v) => setSingle('gearStorage', v)} label={label} />
        <ChipRow title={t('relato.sf.group')} opts={TRISTATE} value={sf.receivesGroup} onPick={(v) => setSingle('receivesGroup', v)} label={label} />

        <div>
          <p className="text-xs font-semibold text-chrome mb-2">{t('relato.sf.amenities')}</p>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.map((o) => {
              const active = Array.isArray(sf.amenities) && sf.amenities.includes(o.value);
              return (
                <button key={o.value} type="button" onClick={() => toggleAmenity(o.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${active ? 'bg-primary text-inverse border-primary' : 'border-asphalt/40 text-steel hover:text-chrome'}`}>
                  {label(o)}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Moto used */}
      {motos.length > 0 && (
        <section className="glass-card p-5 space-y-3">
          <h2 className="font-mono font-black uppercase tracking-widest text-xs text-steel flex items-center gap-2">
            <Bike className="w-4 h-4" /> {t('relato.section.motoUsed')}
          </h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setMotoId('')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${!motoId ? 'bg-primary text-inverse border-primary' : 'border-asphalt/40 text-steel'}`}>
              {t('relato.moto.none')}
            </button>
            {motos.map((m) => (
              <button key={m.id} type="button" onClick={() => setMotoId(String(m.id))}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${motoId === String(m.id) ? 'bg-primary text-inverse border-primary' : 'border-asphalt/40 text-steel'}`}>
                {m.make} {m.model}{m.year ? ` ${m.year}` : ''}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 5. Media */}
      <section className="glass-card p-5 space-y-3">
        <h2 className="font-mono font-black uppercase tracking-widest text-xs text-steel flex items-center gap-2">
          <Camera className="w-4 h-4" /> {t('relato.section.photos')}
        </h2>
        <div className="flex flex-wrap gap-3">
          {media.map((m, i) => (
            <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-asphalt/30">
              <img src={m.url} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => setMedia((arr) => arr.filter((_, j) => j !== i))}
                className="absolute top-0.5 right-0.5 bg-engine/80 rounded-full p-0.5">
                <X className="w-3 h-3 text-chrome" />
              </button>
            </div>
          ))}
          {media.length < 12 && (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="w-20 h-20 rounded-lg border-2 border-dashed border-asphalt/40 flex items-center justify-center text-steel hover:text-primary">
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
        </div>
      </section>

      {/* 6. Link + presence */}
      <section className="glass-card p-5 space-y-3">
        <h2 className="font-mono font-black uppercase tracking-widest text-xs text-steel">{t('relato.section.extras')}</h2>
        <input className="input-field" placeholder={t('relato.field.linkPlaceholder')} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
        <button type="button" onClick={() => captureLocation('evidence')}
          className="btn-secondary flex items-center gap-2 text-sm">
          <ShieldCheck className="w-4 h-4" /> {t('relato.presence.capture')}
        </button>
        {evidenceCoords && <p className="text-xs text-success flex items-center gap-1"><Check className="w-3 h-3" /> {t('relato.presence.captured')}</p>}
        <p className="text-xs text-steel">{t('relato.presence.hint')}</p>
      </section>

      {/* Actions */}
      <div className="flex gap-3 pb-4">
        <button type="button" disabled={submitting} onClick={() => submit('draft')}
          className="btn-secondary flex-1 flex items-center justify-center gap-2">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {t('relato.action.draft')}
        </button>
        <button type="button" disabled={submitting} onClick={() => submit('pending')}
          className="btn-primary flex-1 flex items-center justify-center gap-2">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {t('relato.action.submit')}
        </button>
      </div>
    </div>
  );
}

// Single-select chip row (deselect by tapping the active chip).
function ChipRow({ title, opts, value, onPick, label }: {
  title: string; opts: Opt[]; value: string | undefined; onPick: (v: string) => void; label: (o: Opt) => string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-chrome mb-2">{title}</p>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => (
          <button key={o.value} type="button" onClick={() => onPick(o.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${value === o.value ? 'bg-primary text-inverse border-primary' : 'border-asphalt/40 text-steel hover:text-chrome'}`}>
            {label(o)}
          </button>
        ))}
      </div>
    </div>
  );
}
