import React from 'react';
import { Droplet, AlertTriangle, CheckCircle2, Settings2, Bell } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import PremiumLock from './PremiumLock';

interface Props {
  moto: any; // includes oil_alert + make
  canAlert: boolean;
  isOwner: boolean;
  onConfigure: () => void;
}

/**
 * Top-of-garage oil-change alert banner. In-app visual only (no push yet); the
 * data shape (state/km_remaining/reason) is ready for a future notification job.
 */
export default function OilAlertCard({ moto, canAlert, isOwner, onConfigure }: Props) {
  const { t } = useLanguage();
  const alert = moto?.oil_alert || { state: 'inactive' };
  const state: string = alert.state;
  const moto_name = moto?.make || t('garage.thisMoto');

  // Visitors only see actionable states; owners see everything (incl. setup CTAs).
  if (!isOwner && ['inactive', 'locked', 'no_record'].includes(state)) return null;

  if (state === 'locked') {
    return (
      <PremiumLock unlocked={canAlert} title={t('garage.alert.title')} description={t('garage.alert.lockedDesc')}>
        <div className="flex items-center gap-3 rounded-2xl border border-inverse/5 bg-engine/40 p-4">
          <Bell className="w-5 h-5 text-steel" />
          <p className="text-xs text-steel">{t('garage.alert.lockedDesc')}</p>
        </div>
      </PremiumLock>
    );
  }

  if (state === 'inactive') {
    return (
      <button
        onClick={onConfigure}
        className="w-full flex items-center justify-between gap-3 rounded-2xl border border-inverse/5 bg-engine/40 p-4 hover:border-primary/30 transition-all"
      >
        <span className="flex items-center gap-2 text-xs text-steel">
          <Bell className="w-4 h-4" />
          {t('garage.alert.activate')}
        </span>
        <Settings2 className="w-4 h-4 text-steel" />
      </button>
    );
  }

  if (state === 'no_record') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-info/20 bg-info/10 p-4">
        <Droplet className="w-5 h-5 text-info shrink-0" />
        <p className="text-xs text-info">{t('garage.alert.noRecord')}</p>
      </div>
    );
  }

  // normal / attention / overdue
  const tone =
    state === 'overdue'
      ? { box: 'border-error/30 bg-error/10', text: 'text-error', Icon: AlertTriangle }
      : state === 'attention'
        ? { box: 'border-warning/30 bg-warning/10', text: 'text-warning', Icon: AlertTriangle }
        : { box: 'border-success/30 bg-success/10', text: 'text-success', Icon: CheckCircle2 };

  const km = alert.km_remaining;
  let message = '';
  if (state === 'overdue') {
    message =
      alert.reason === 'time'
        ? t('garage.alert.overdueTime', { moto: moto_name })
        : t('garage.alert.overdueKm', { km: Math.abs(Math.round(km ?? 0)).toLocaleString('pt-BR'), moto: moto_name });
  } else {
    message = t('garage.alert.remaining', { km: Math.round(km ?? 0).toLocaleString('pt-BR'), moto: moto_name });
  }

  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-4 ${tone.box}`}>
      <tone.Icon className={`w-5 h-5 shrink-0 ${tone.text}`} />
      <p className={`text-xs font-medium flex-1 ${tone.text}`}>{message}</p>
      {isOwner && (
        <button onClick={onConfigure} className="text-steel hover:text-chrome transition-colors" title={t('garage.alert.configure')}>
          <Settings2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
