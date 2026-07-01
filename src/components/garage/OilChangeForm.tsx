import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { fetchWithAuth } from '../../utils/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNotification } from '../../contexts/NotificationContext';
import { toDateInput, fromDateInput } from './format';
import OficinaAutocomplete, { OficinaRef } from './OficinaAutocomplete';

interface Props {
  motoId: number;
  record?: any; // editing existing oil change
  lastKnownOdometer?: number | null;
  onSaved: () => void;
  onCancel: () => void;
}

export default function OilChangeForm({ motoId, record, lastKnownOdometer, onSaved, onCancel }: Props) {
  const { t } = useLanguage();
  const { showNotification } = useNotification();
  const editing = !!record;

  const [km, setKm] = useState<string>(record?.km != null ? String(record.km) : '');
  const [oilType, setOilType] = useState<string>(record?.oil_type || '');
  const [liters, setLiters] = useState<string>(record?.liters != null ? String(record.liters) : '');
  const [shop, setShop] = useState<string>(record?.shop || record?.shop_ref?.nomeExibicao || '');
  const [shopRef, setShopRef] = useState<OficinaRef | null>(record?.shop_ref || null);
  const [note, setNote] = useState<string>(record?.note || '');
  const [recordDate, setRecordDate] = useState<string>(toDateInput(record?.record_date));
  const [busy, setBusy] = useState(false);

  const kmNum = parseFloat(km);
  const litersNum = parseFloat(liters);
  const decreasing = !isNaN(kmNum) && lastKnownOdometer != null && kmNum < lastKnownOdometer;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(kmNum) || kmNum <= 0 || isNaN(litersNum) || litersNum <= 0 || !oilType.trim()) {
      showNotification('error', t('garage.invalidNumbers'));
      return;
    }
    setBusy(true);
    try {
      const payload: any = {
        km: kmNum,
        oil_type: oilType.trim(),
        liters: litersNum,
        shop: shop.trim() || null,
        shop_ref: shop.trim() ? shopRef || { refType: 'freetext', refId: null, nomeExibicao: shop.trim() } : null,
        note: note.trim() || null,
        record_date: fromDateInput(recordDate),
      };
      const url = editing ? `/api/oil-changes/${record.id}` : `/api/motorcycles/${motoId}/oil-changes`;
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

      <div>
        <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{t('garage.oilType')}</label>
        <input type="text" required value={oilType} onChange={(e) => setOilType(e.target.value)} className="input-field py-2 text-sm mt-1" placeholder="10W40 semissintético" />
      </div>

      <div>
        <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{t('garage.oficina')}</label>
        <div className="mt-1">
          <OficinaAutocomplete
            value={shop}
            onChange={setShop}
            onSelectRef={setShopRef}
          />
        </div>
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
