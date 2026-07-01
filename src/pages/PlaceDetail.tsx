import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, ArrowLeft, Plus } from 'lucide-react';
import { fetchWithAuth } from '../utils/api';
import { useLanguage } from '../contexts/LanguageContext';
import { fieldLabel, fieldValueLabel } from '../utils/relatoLabels';
import RelatoCard from '../components/RelatoCard';

export default function PlaceDetail() {
  const { placeId } = useParams();
  const { t, language } = useLanguage();
  const [place, setPlace] = useState<any>(null);
  const [relatos, setRelatos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!placeId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchWithAuth(`/api/places/${encodeURIComponent(placeId)}`);
        if (res.ok) {
          const data = await res.json();
          setPlace(data.place);
          setRelatos(data.relatos || []);
        } else {
          setNotFound(true);
        }
      } catch (e) {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [placeId]);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-steel/20 border-t-primary rounded-full animate-spin" /></div>;
  }
  if (notFound || !place) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center text-steel">{t('place.notFound')}</div>;
  }

  const moto = place.motoAttributes || {};
  const motoKeys = Object.keys(moto).filter((k) => moto[k] != null && !(Array.isArray(moto[k]) && moto[k].length === 0));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <Link to="/discover" className="inline-flex items-center gap-2 text-steel hover:text-primary text-sm">
        <ArrowLeft className="w-4 h-4" /> {t('place.back')}
      </Link>

      <header className="glass-card p-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-display font-black uppercase italic tracking-tighter text-primary break-words">{place.name}</h1>
            <div className="text-sm text-steel mt-1 flex items-center gap-2 flex-wrap">
              <MapPin className="w-4 h-4 shrink-0" />
              {place.address || `${Number(place.lat).toFixed(4)}, ${Number(place.lng).toFixed(4)}`}
              {place.category && <span className="badge-chrome">{place.category}</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-display font-black text-chrome">{place.relatoCount ?? relatos.length}</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-steel">{t('place.reports')}</div>
          </div>
        </div>

        {motoKeys.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {motoKeys.map((k) => (
              <span key={k} className="px-2.5 py-1 rounded-lg bg-oil/60 text-xs text-chrome">
                <span className="text-steel">{fieldLabel(k, language)}:</span> {fieldValueLabel(k, moto[k], language)}
              </span>
            ))}
          </div>
        )}

        <Link
          to={`/relatos/new?placeId=${encodeURIComponent(place.placeId)}&placeName=${encodeURIComponent(place.name)}`}
          className="btn-primary inline-flex items-center gap-2 text-sm mt-2"
        >
          <Plus className="w-4 h-4" /> {t('place.addReport')}
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
