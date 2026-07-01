import React, { useEffect, useState } from 'react';
import { X, Plus, Edit2, Trash2, Fuel, Droplet, Bell, Gauge } from 'lucide-react';
import { fetchWithAuth } from '../../utils/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNotification } from '../../contexts/NotificationContext';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import EconomyCards from './EconomyCards';
import CostCards from './CostCards';
import RefuelForm from './RefuelForm';
import OilChangeForm from './OilChangeForm';
import PremiumLock from './PremiumLock';
import DeleteRecordModal from './DeleteRecordModal';
import { fmtKm, fmtNum, fmtBRL } from './format';

interface Props {
  isOpen: boolean;
  moto: any | null; // live moto from data.garage (refreshes on onChanged)
  isOwner: boolean;
  onClose: () => void;
  onChanged: () => void; // parent fetchProfile
  initialTab?: 'refuel' | 'oil';
  initialAlertSettings?: boolean;
}

function getCurrentUser() {
  try {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
}

const byDateDesc = (a: any, b: any) => (String(a.record_date) < String(b.record_date) ? 1 : -1);
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export default function GarageDetailModal({ isOpen, moto, isOwner, onClose, onChanged, initialTab = 'refuel', initialAlertSettings }: Props) {
  const { t } = useLanguage();
  const { showNotification } = useNotification();
  const { canAccess } = useFeatureAccess();
  const user = getCurrentUser();
  const can = (f: string) => canAccess(f, user?.plan, user?.role, user?.type);
  const canOil = can('oil_change_records');
  const canGeneral = can('fuel_economy_general');
  const canCost = can('cost_per_km');
  const canAlert = can('oil_change_alert');

  const [tab, setTab] = useState<'refuel' | 'oil'>(initialTab);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'refuelings' | 'oil-changes'; id: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showAlertSettings, setShowAlertSettings] = useState(!!initialAlertSettings);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setShowAlertSettings(!!initialAlertSettings);
    }
  }, [isOpen, initialTab, initialAlertSettings]);

  useEffect(() => {
    setAdding(false);
    setEditing(null);
  }, [tab]);

  if (!isOpen || !moto) return null;

  const stats = moto.garage_stats || {};
  const lastKnownOdo = stats.last_known_odometer ?? null;
  const refuelings = [...(moto.refuelings || [])].sort(byDateDesc);
  const oilChanges = [...(moto.oil_changes || [])].sort(byDateDesc);

  const afterSave = () => {
    setAdding(false);
    setEditing(null);
    onChanged();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`/api/${deleteTarget.kind}/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('success', t('garage.deleted'));
        onChanged();
      } else {
        showNotification('error', t('garage.saveError'));
      }
    } catch (e) {
      console.error(e);
      showNotification('error', t('garage.saveError'));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const RecordActions = ({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) =>
    isOwner ? (
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} className="p-1.5 rounded-lg text-steel hover:text-primary transition-colors" title={t('common.edit')}>
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg text-steel hover:text-error transition-colors" title={t('garage.deleteConfirm')}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-engine/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-engine border border-inverse/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-inverse/5">
          <div className="min-w-0">
            <div className="text-[10px] font-mono font-black text-primary uppercase tracking-[0.2em]">{moto.year}</div>
            <h2 className="font-display font-black uppercase italic text-xl text-chrome tracking-tight truncate">
              {moto.make} <span className="text-steel">{moto.model}</span>
            </h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-oil flex items-center justify-center text-steel hover:text-chrome transition-all shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Odometer readout */}
        {lastKnownOdo != null && (
          <div className="flex items-center justify-center gap-3 px-6 py-3 bg-oil/60 border-b border-inverse/5">
            <Gauge className="w-4 h-4 text-primary shrink-0" />
            <span className="text-[10px] font-mono font-black text-steel uppercase tracking-[0.2em]">{t('garage.odometer')}</span>
            <span className="font-display font-black text-lg text-chrome leading-none">{fmtKm(lastKnownOdo)}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-2 border-b border-inverse/5">
          <button onClick={() => setTab('refuel')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-mono font-black uppercase tracking-widest transition-all ${tab === 'refuel' ? 'bg-primary/15 text-primary' : 'text-steel hover:text-chrome'}`}>
            <Fuel className="w-4 h-4" />
            {t('garage.tabRefuel')}
          </button>
          <button onClick={() => setTab('oil')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-mono font-black uppercase tracking-widest transition-all ${tab === 'oil' ? 'bg-primary/15 text-primary' : 'text-steel hover:text-chrome'}`}>
            <Droplet className="w-4 h-4" />
            {t('garage.tabOil')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
          {/* ---------------- Refuel tab ---------------- */}
          {tab === 'refuel' && (
            <>
              <EconomyCards stats={stats} canGeneral={canGeneral} />
              <CostCards stats={stats} canCost={canCost} />

              {isOwner && !adding && !editing && (
                <button onClick={() => setAdding(true)} className="w-full btn-primary py-2.5 text-xs flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" />
                  {t('garage.addRefuel')}
                </button>
              )}
              {isOwner && adding && (
                <RefuelForm motoId={moto.id} lastKnownOdometer={lastKnownOdo} onSaved={afterSave} onCancel={() => setAdding(false)} />
              )}
              {isOwner && editing && (
                <RefuelForm motoId={moto.id} record={editing} lastKnownOdometer={lastKnownOdo} onSaved={afterSave} onCancel={() => setEditing(null)} />
              )}

              <div className="space-y-3">
                {refuelings.length === 0 ? (
                  <p className="text-xs text-steel text-center py-6">{t('garage.noRefuel')}</p>
                ) : (
                  refuelings.map((r) => (
                    <div key={r.id} className="bg-engine/40 rounded-2xl border border-inverse/5 p-4">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-bold text-sm text-chrome">{fmtKm(r.km)}</span>
                            {r.full_tank ? (
                              <span className="text-[9px] font-mono uppercase text-success bg-success/10 px-1.5 py-0.5 rounded">{t('garage.fullTank')}</span>
                            ) : (
                              <span className="text-[9px] font-mono uppercase text-steel bg-inverse/5 px-1.5 py-0.5 rounded">{t('garage.partialTank')}</span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-steel uppercase tracking-widest mt-1">
                            {fmtNum(r.liters)} L · {t(`garage.fuel.${r.fuel_type}`)} · {fmtDate(r.record_date)}
                          </div>
                          {(r.total_value != null || r.price_per_liter != null) && (
                            <div className="text-[10px] font-mono text-steel mt-0.5">
                              {r.total_value != null ? fmtBRL(r.total_value) : ''}
                              {r.price_per_liter != null ? ` (${fmtBRL(r.price_per_liter)}/L)` : ''}
                            </div>
                          )}
                        </div>
                        <RecordActions onEdit={() => { setEditing(r); setAdding(false); }} onDelete={() => setDeleteTarget({ kind: 'refuelings', id: r.id })} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* ---------------- Oil tab ---------------- */}
          {tab === 'oil' && (
            <PremiumLock unlocked={canOil} title={t('garage.oilLockedTitle')} description={t('garage.oilLockedDesc')}>
              <div className="space-y-6">
                {isOwner && (
                  <AlertSettings
                    moto={moto}
                    open={showAlertSettings}
                    onToggle={() => setShowAlertSettings((v) => !v)}
                    onSaved={onChanged}
                  />
                )}

                {isOwner && !adding && !editing && (
                  <button onClick={() => setAdding(true)} className="w-full btn-primary py-2.5 text-xs flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" />
                    {t('garage.addOil')}
                  </button>
                )}
                {isOwner && adding && (
                  <OilChangeForm motoId={moto.id} lastKnownOdometer={lastKnownOdo} onSaved={afterSave} onCancel={() => setAdding(false)} />
                )}
                {isOwner && editing && (
                  <OilChangeForm motoId={moto.id} record={editing} lastKnownOdometer={lastKnownOdo} onSaved={afterSave} onCancel={() => setEditing(null)} />
                )}

                <div className="space-y-3">
                  {oilChanges.length === 0 ? (
                    <p className="text-xs text-steel text-center py-6">{t('garage.noOil')}</p>
                  ) : (
                    oilChanges.map((o) => (
                      <div key={o.id} className="bg-engine/40 rounded-2xl border border-inverse/5 p-4">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-display font-bold text-sm text-chrome">{fmtKm(o.km)}</span>
                              <span className="text-[10px] font-mono text-primary truncate">{o.oil_type}</span>
                            </div>
                            <div className="text-[10px] font-mono text-steel uppercase tracking-widest mt-1">
                              {fmtNum(o.liters)} L · {fmtDate(o.record_date)}
                            </div>
                            {o.shop && <div className="text-[10px] font-mono text-steel mt-0.5 truncate">{o.shop}</div>}
                            {o.note && <div className="text-[10px] text-steel mt-0.5 truncate">{o.note}</div>}
                          </div>
                          <RecordActions onEdit={() => { setEditing(o); setAdding(false); }} onDelete={() => setDeleteTarget({ kind: 'oil-changes', id: o.id })} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </PremiumLock>
          )}
        </div>
      </div>

      <DeleteRecordModal isOpen={!!deleteTarget} busy={deleting} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    </div>
  );
}

// --- Oil-change alert configuration (premium) ---
function AlertSettings({ moto, open, onToggle, onSaved }: { moto: any; open: boolean; onToggle: () => void; onSaved: () => void }) {
  const { t } = useLanguage();
  const { showNotification } = useNotification();
  const cfg = moto.oil_alert_config || {};
  const [active, setActive] = useState<boolean>(!!cfg.active);
  const [intervalKm, setIntervalKm] = useState<string>(cfg.interval_km != null ? String(cfg.interval_km) : '');
  const [intervalMonths, setIntervalMonths] = useState<string>(cfg.interval_months != null ? String(cfg.interval_months) : '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActive(!!cfg.active);
    setIntervalKm(cfg.interval_km != null ? String(cfg.interval_km) : '');
    setIntervalMonths(cfg.interval_months != null ? String(cfg.interval_months) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moto.id, cfg.active, cfg.interval_km, cfg.interval_months]);

  const save = async () => {
    const km = parseFloat(intervalKm);
    if (active && (isNaN(km) || km <= 0)) {
      showNotification('error', t('garage.alert.intervalRequired'));
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithAuth(`/api/motorcycles/${moto.id}/oil-alert`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active,
          interval_km: intervalKm ? km : null,
          interval_months: intervalMonths ? parseFloat(intervalMonths) : null,
        }),
      });
      if (res.ok) {
        showNotification('success', t('garage.saved'));
        onSaved();
      } else {
        showNotification('error', t('garage.saveError'));
      }
    } catch (e) {
      console.error(e);
      showNotification('error', t('garage.saveError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-inverse/5 bg-engine/40 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4">
        <span className="flex items-center gap-2 text-xs font-mono font-black text-chrome uppercase tracking-widest">
          <Bell className="w-4 h-4 text-primary" />
          {t('garage.alert.settingsTitle')}
        </span>
        <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded ${active ? 'bg-success/10 text-success' : 'bg-inverse/5 text-steel'}`}>
          {active ? t('garage.alert.on') : t('garage.alert.off')}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4">
          <button type="button" onClick={() => setActive((v) => !v)} className={`w-full py-2 text-sm rounded-xl border transition-all font-bold ${active ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-oil/50 border-inverse/10 text-steel'}`}>
            {active ? t('garage.alert.enabled') : t('garage.alert.disabled')}
          </button>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{t('garage.alert.intervalKm')}</label>
              <input type="number" inputMode="numeric" min="1" value={intervalKm} onChange={(e) => setIntervalKm(e.target.value)} className="input-field py-2 text-sm mt-1" placeholder="3000" />
            </div>
            <div>
              <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{t('garage.alert.intervalMonths')}</label>
              <input type="number" inputMode="numeric" min="1" value={intervalMonths} onChange={(e) => setIntervalMonths(e.target.value)} className="input-field py-2 text-sm mt-1" placeholder="6" />
            </div>
          </div>
          <button onClick={save} disabled={busy} className="w-full btn-primary py-2 text-xs">
            {busy ? t('profile.saving') : t('garage.alert.saveSettings')}
          </button>
        </div>
      )}
    </div>
  );
}
