import React from 'react';
import { DollarSign } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import PremiumLock from './PremiumLock';
import { fmtBRL } from './format';

interface Props {
  stats: any; // garage_stats
  canCost: boolean;
}

function CostTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-engine/40 rounded-2xl border border-inverse/5 p-4">
      <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{label}</div>
      <div className="mt-1 font-display font-black text-xl text-chrome leading-none">
        {value}
        <span className="text-xs text-steel ml-1">/km</span>
      </div>
    </div>
  );
}

/** Cost per km — entirely premium-gated (locked-but-visible for freemium). */
export default function CostCards({ stats, canCost }: Props) {
  const { t } = useLanguage();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-mono font-black text-steel uppercase tracking-widest">
        <DollarSign className="w-3 h-3" />
        {t('garage.cost')}
      </div>
      <PremiumLock unlocked={canCost} title={t('garage.cost')} description={t('garage.costLockedDesc')}>
        <div className="grid grid-cols-2 gap-3">
          <CostTile label={t('garage.lastSegment')} value={fmtBRL(stats?.cost_per_km_last)} />
          <CostTile label={t('garage.generalAvg')} value={fmtBRL(stats?.cost_per_km_general)} />
        </div>
      </PremiumLock>
    </div>
  );
}
