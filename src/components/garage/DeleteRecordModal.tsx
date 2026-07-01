import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface Props {
  isOpen: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation modal for deleting a garage record. The warning is informative —
 * the server recomputes everything on the next read, so consistency is kept
 * regardless. Uses a real modal (the project forbids window.confirm).
 */
export default function DeleteRecordModal({ isOpen, busy, onClose, onConfirm }: Props) {
  const { t } = useLanguage();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2100] flex items-end sm:items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-engine/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-engine border border-inverse/10 rounded-3xl shadow-2xl p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-oil flex items-center justify-center text-steel hover:text-chrome transition-all"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex flex-col items-center text-center gap-4">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-error/10 text-error">
            <AlertTriangle className="w-6 h-6" />
          </span>
          <h3 className="font-display font-black uppercase italic text-lg text-chrome">
            {t('garage.deleteTitle')}
          </h3>
          <p className="text-sm text-steel leading-snug">{t('garage.deleteWarning')}</p>
          <div className="flex gap-3 w-full mt-2">
            <button onClick={onClose} className="flex-1 btn-secondary py-2.5 text-sm" disabled={busy}>
              {t('common.cancel')}
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className="flex-1 py-2.5 text-sm rounded-xl bg-error text-chrome font-bold uppercase tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy ? t('profile.saving') : t('garage.deleteConfirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
