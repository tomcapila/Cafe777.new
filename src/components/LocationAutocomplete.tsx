import React, { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface LocationAutocompleteProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onSelectDetails?: (details: any) => void;
  placeholder?: string;
  types?: string[];
  name?: string;
  className?: string;
}

const HERE_API_KEY = "BNecDxcWcrUQ5X1SzghrH2OMxssFG8pgDA6-D9MrlDk";

export default function LocationAutocomplete({ value, defaultValue, onChange, onSelectDetails, placeholder = "Search location...", types, name, className }: LocationAutocompleteProps) {
  const { language } = useLanguage();
  const [inputValue, setInputValue] = useState(value || defaultValue || '');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fallback bias to the centroid of Brazil when geolocation is unavailable/denied.
  const BRAZIL_CENTROID = { lat: -14.235, lng: -51.925 };

  useEffect(() => {
    // Get user location for more precise HERE Maps autosuggest
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.warn("Geolocation warning:", error);
          setUserLocation(BRAZIL_CENTROID);
        }
      );
    } else {
      setUserLocation(BRAZIL_CENTROID);
    }
  }, []);

  useEffect(() => {
    if (value !== undefined) {
      setInputValue(value);
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchHereAutosuggest = async (query: string) => {
    if (!query.trim() || query.length < 3) {
      setPredictions([]);
      setIsOpen(false);
      return;
    }
    
    // We need at parameter for autosuggest
    const at = userLocation || BRAZIL_CENTROID;
    const atParam = `at=${at.lat},${at.lng}`;
    const lang = language === 'pt' ? 'pt-BR' : 'en-US';

    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`/api/places/autocomplete?${atParam}&q=${encodeURIComponent(query)}&lang=${lang}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (resp.ok) {
        const data = await resp.json();
        setPredictions(data.items || []);
        setIsOpen(true);
      } else {
        setPredictions([]);
        setIsOpen(false);
      }
    } catch (err) {
      console.error("HERE Autosuggest error", err);
      setPredictions([]);
    }
  }

  // Clean up any pending debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (onChange) onChange(val); // Update parent with raw text

    // Debounce the autosuggest fetch on the typed value. This is driven directly
    // from the keystroke (not from comparing against the `value` prop, which the
    // parent mirrors back — that comparison made the fetch never fire).
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!val.trim()) {
      setPredictions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      fetchHereAutosuggest(val);
    }, 300);
  };

  const handleSelectPrediction = (prediction: any) => {
    const title = prediction.title;
    setInputValue(title);
    if (onChange) onChange(title);
    if (onSelectDetails) onSelectDetails(prediction);
    setIsOpen(false);
    setPredictions([]);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-steel" />
      <input
        type="text"
        name={name}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => {
          if (predictions.length > 0) setIsOpen(true);
        }}
        autoCapitalize="sentences"
        className={className || "w-full bg-oil/50 border border-inverse/10 rounded-xl pl-12 pr-4 py-3 text-chrome focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"}
        placeholder={placeholder}
      />
      
      {isOpen && predictions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-engine border border-inverse/10 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {predictions.map((prediction, i) => (
            <li
              key={prediction.id || i}
              onClick={() => handleSelectPrediction(prediction)}
              className="px-4 py-3 hover:bg-engine cursor-pointer text-sm text-chrome border-b border-inverse/5 last:border-0"
            >
              {prediction.title}
              {prediction.address && prediction.address.label && prediction.address.label !== prediction.title && (
                 <div className="text-[10px] text-steel mt-0.5">{prediction.address.label}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

