import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { fetchWithAuth } from '../../utils/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNotification } from '../../contexts/NotificationContext';
import { FUEL_TYPES } from '../../utils/garageCalculations';
import { toDateInput, fromDateInput, fmtBRL, fmtNum } from './format';

interface Props {
  motoId: number;
  record?: any; // editing existing refueling
  lastKnownOdometer?: number | null;
  onSaved: () => void;
  onCancel: () => void;
}

export default function RefuelForm({ motoId, record, lastKnownOdometer, onSaved, onCancel }: Props) {
  const { t } = useLanguage();
  const { showNotification } = useNotification();
  const editing = !!record;

  const [km, setKm] = useState<string>(record?.km != null ? String(record.km) : '');
  const [liters, setLiters] = useState<string>(record?.liters != null ? String(record.liters) : '');
  const [fuelType, setFuelType] = useState<string>(record?.fuel_type || 'gasolina_comum');
  const [fullTank, setFullTank] = useState<boolean>(record?.full_tank ?? true);
  const [priceMode, setPriceMode] = useState<'per_liter' | 'total'>(
    record?.total_value != null && record?.price_per_liter == null ? 'total' : 'per_liter',
  );
  const [price, setPrice] = useState<string>(
    record?.price_per_liter != null ? String(record.price_per_liter) : record?.total_value != null ? String(record.total_value) : '',
  );
  const [note, setNote] = useState<string>(record?.note || '');
  const [recordDate, setRecordDate] = useState<string>(toDateInput(record?.record_date));
  const [busy, setBusy] = useState(false);

  const kmNum = parseFloat(km);
  const litersNum = parseFloat(liters);
  const priceNum = parseFloat(price);
  const decreasing = !isNaN(kmNum) && lastKnownOdometer != null && kmNum < lastKnownOdometer;

  // Live-derived counterpart of whichever price field is entered.
  const derived =
    !isNaN(priceNum) && !isNaN(litersNum) && litersNum > 0
      ? priceMode === 'per_liter'
        ? `${t('garage.total')}: ${fmtBRL(priceNum * litersNum)}`
        : `${t('garage.pricePerLiter')}: ${fmtBRL(priceNum / litersNum)}`
      : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(kmNum) || kmNum <= 0 || isNaN(litersNum) || litersNum <= 0) {
      showNotification('error', t('garage.invalidNumbers'));
      return;
    }
    setBusy(true);
    try {
      const payload: any = {
        km: kmNum,
        liters: litersNum,
        fuel_type: fuelType,
        full_tank: fullTank,
        note: note.trim() || null,
        record_date: fromDateInput(recordDate),
        price_per_liter: null,
        total_value: null,
      };
      if (!isNaN(priceNum) && priceNum > 0) {
        if (priceMode === 'per_liter') payload.price_per_liter = priceNum;
        else payload.total_value = priceNum;
      }
      const url = editing ? `/api/refuelings/${record.id}` : `/api/motorcycles/${motoId}/refuelings`;
      const res = await fetchWithAuth(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showNotification('success', t('garage.saved'));
        onSaved();
      } else {
        showNotification('error', t('garage.saveError'));
      }
    } catch (err) {
      console.error(err);
      showNotification('error', t('garage.saveError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 p-5 bg-primary/5 rounded-2xl border border-primary/20">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{t('garage.odometer')}</label>
          <input type="number" inputMode="numeric" min="1" required value={km} onChange={(e) => setKm(e.target.value)} className="input-field py-2 text-sm mt-1" placeholder="km" />
        </div>
        <div>
          <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{t('garage.liters')}</label>
          <input type="number" inputMode="decimal" step="0.01" min="0.01" required value={liters} onChange={(e) => setLiters(e.target.value)} className="input-field py-2 text-sm mt-1" placeholder="L" />
        </div>
      </div>

      {decreasing && (
        <div className="flex items-start gap-2 text-[11px] text-warning bg-warning/10 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{t('garage.odometerWarning', { km: Math.round(lastKnownOdometer as number).toLocaleString('pt-BR') })}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{t('garage.fuelType')}</label>
          <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className="input-field py-2 text-sm mt-1">
            {FUEL_TYPES.map((f) => (
              <option key={f} value={f}>{t(`garage.fuel.${f}`)}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{t('garage.tank')}</label>
          <button type="button" onClick={() => setFullTank((v) => !v)} className={`mt-1 py-2 text-sm rounded-xl border transition-all font-bold ${fullTank ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-oil/50 border-inverse/10 text-steel'}`}>
            {fullTank ? t('garage.fullTank') : t('garage.partialTank')}
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{t('garage.price')}</label>
          <div className="flex bg-oil rounded-lg p-0.5">
            <button type="button" onClick={() => setPriceMode('per_liter')} className={`text-[9px] font-mono font-black uppercase px-2 py-1 rounded ${priceMode === 'per_liter' ? 'bg-engine text-chrome' : 'text-steel'}`}>{t('garage.perLiter')}</button>
            <button type="button" onClick={() => setPriceMode('total')} className={`text-[9px] font-mono font-black uppercase px-2 py-1 rounded ${priceMode === 'total' ? 'bg-engine text-chrome' : 'text-steel'}`}>{t('garage.totalValue')}</button>
          </div>
        </div>
        <input type="number" inputMode="decimal" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="input-field py-2 text-sm mt-1" placeholder={priceMode === 'per_liter' ? 'R$/L' : 'R$'} />
        {derived && <p className="text-[10px] text-steel mt-1 font-mono">{derived}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{t('garage.date')}</label>
          <input type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} className="input-field py-2 text-sm mt-1" />
        </div>
        <div>
          <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{t('garage.note')}</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="input-field py-2 text-sm mt-1" placeholder={t('garage.optional')} />
        </div>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 btn-secondary py-2 text-xs">{t('common.cancel')}</button>
        <button type="submit" disabled={busy} className="flex-1 btn-primary py-2 text-xs">{busy ? t('profile.saving') : t('garage.save')}</button>
      </div>
    </form>
  );
}
