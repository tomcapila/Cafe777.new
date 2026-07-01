import { ShieldCheck, Bike, Star } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { verificationLabel, fieldLabel, fieldValueLabel } from '../utils/relatoLabels';

// Shared read-only relato card for the place page and route page (Fase 3 / Fase 5).
export default function RelatoCard({ r }: { r: any }) {
  const { t, language } = useLanguage();
  return (
    <article className="glass-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-display font-black text-chrome break-words">{r.title}</h2>
          <div className="text-xs text-steel">{t('place.by')} {r.authorName || r.authorId}</div>
        </div>
        <div className="flex gap-2 items-center shrink-0">
          {r.status === 'featured' && <Star className="w-4 h-4 text-primary" />}
          <span className="badge-primary inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> {verificationLabel(r.verificationLevel, language)}</span>
        </div>
      </div>

      {Array.isArray(r.media) && r.media.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {r.media.map((m: any, i: number) => (
            <img key={i} src={m.url} alt="" className="w-24 h-24 rounded-lg object-cover border border-inverse/10" />
          ))}
        </div>
      )}

      <p className="text-sm text-chrome/90 whitespace-pre-wrap break-words">{r.body}</p>

      {r.structuredFields && Object.keys(r.structuredFields).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(r.structuredFields)
            .filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0))
            .map(([k, v]) => (
              <span key={k} className="px-2 py-1 rounded-lg bg-oil/40 text-[10px] text-steel">
                {fieldLabel(k, language)}: {fieldValueLabel(k, v, language)}
              </span>
            ))}
        </div>
      )}

      {r.motoUsed?.snapshot && (
        <div className="flex items-center gap-2 text-xs text-steel">
          <Bike className="w-4 h-4" /> {r.motoUsed.snapshot.make} {r.motoUsed.snapshot.model}{r.motoUsed.snapshot.year ? ` ${r.motoUsed.snapshot.year}` : ''}
        </div>
      )}
    </article>
  );
}
