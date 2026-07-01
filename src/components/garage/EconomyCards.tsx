import React from 'react';
import { Gauge } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import PremiumLock from './PremiumLock';
import { fmtNum } from './format';

interface Props {
  stats: any; // garage_stats
  canGeneral: boolean;
}

function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-engine/40 rounded-2xl border border-inverse/5 p-4">
      <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{label}</div>
      <div className="mt-1 font-display font-black text-2xl text-chrome leading-none">
        {value}
        {unit && <span className="text-sm text-steel ml-1">{unit}</span>}
      </div>
    </div>
  );
}

/** Fuel economy: last-segment km/l (always) + general weighted km/l (premium). */
export default function EconomyCards({ stats, canGeneral }: Props) {
  const { t } = useLanguage();
  const hasLast = stats?.last_segment_kmpl != null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-mono font-black text-steel uppercase tracking-widest">
        <Gauge className="w-3 h-3" />
        {t('garage.consumption')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {hasLast ? (
          <StatTile label={t('garage.lastSegment')} value={fmtNum(stats.last_segment_kmpl)} unit="km/l" />
        ) : (
          <div className="bg-engine/40 rounded-2xl border border-inverse/5 p-4 col-span-2">
            <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{t('garage.lastSegment')}</div>
            <p className="text-xs text-steel mt-2 leading-snug">{t('garage.avgPlaceholder')}</p>
          </div>
        )}
        {hasLast && (
          <PremiumLock unlocked={canGeneral} compact title={t('garage.generalAvg')}>
            <StatTile label={t('garage.generalAvg')} value={fmtNum(stats?.general_kmpl)} unit="km/l" />
          </PremiumLock>
        )}
      </div>
    </div>
  );
}
