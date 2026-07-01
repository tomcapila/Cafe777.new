import React, { useEffect, useRef, useState } from 'react';
import { Wrench } from 'lucide-react';
import { fetchWithAuth } from '../../utils/api';
import { useLanguage } from '../../contexts/LanguageContext';

export interface OficinaRef {
  refType: 'user' | 'place' | 'freetext';
  refId: string | null;
  nomeExibicao: string;
  address?: string | null;
}

interface Props {
  value: string;
  onChange: (text: string) => void;
  onSelectRef: (ref: OficinaRef) => void;
  placeholder?: string;
}

/**
 * Autocomplete for the optional "oficina" (workshop) on an oil change. Searches
 * ecosystem-type users + cached places by name. Free text is always allowed —
 * not matching anything never blocks the form (stored as a freetext ref).
 * Mirrors the 300ms debounce + click-outside pattern of LocationAutocomplete.
 */
export default function OficinaAutocomplete({ value, onChange, onSelectRef, placeholder }: Props) {
  const { t } = useLanguage();
  const [inputValue, setInputValue] = useState(value || '');
  const [results, setResults] = useState<OficinaRef[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const search = async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/garage/oficina-search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
        setIsOpen((data.results || []).length > 0);
      }
    } catch (err) {
      console.error('Oficina search failed', err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange(val);
    // Typing anything makes it a free-text ref until a result is picked.
    onSelectRef({ refType: 'freetext', refId: null, nomeExibicao: val, address: null });

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (r: OficinaRef) => {
    setInputValue(r.nomeExibicao);
    onChange(r.nomeExibicao);
    onSelectRef(r);
    setIsOpen(false);
    setResults([]);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Wrench className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-steel" />
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => { if (results.length > 0) setIsOpen(true); }}
        placeholder={placeholder || t('garage.oficinaPlaceholder')}
        className="input-field py-2 text-sm pl-11"
      />
      {isOpen && results.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-engine border border-inverse/10 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto no-scrollbar">
          {results.map((r, i) => (
            <li
              key={`${r.refType}-${r.refId || i}`}
              onClick={() => handleSelect(r)}
              className="px-4 py-3 hover:bg-oil cursor-pointer text-sm text-chrome border-b border-inverse/5 last:border-0"
            >
              {r.nomeExibicao}
              {r.address && <div className="text-[10px] text-steel mt-0.5">{r.address}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
