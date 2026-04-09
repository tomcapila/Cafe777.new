import React, { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin } from 'lucide-react';

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  types?: string[];
}

export default function LocationAutocomplete({ value, onChange, placeholder = "Search location...", types = ['geocode'] }: LocationAutocompleteProps) {
  const placesLib = useMapsLibrary('places');
  const [inputValue, setInputValue] = useState(value || '');
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!placesLib) return;
    autocompleteService.current = new placesLib.AutocompleteService();
    sessionToken.current = new placesLib.AutocompleteSessionToken();
  }, [placesLib]);

  useEffect(() => {
    setInputValue(value || '');
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange(val); // Update parent with raw text

    if (!val.trim() || !autocompleteService.current) {
      setPredictions([]);
      setIsOpen(false);
      return;
    }

    autocompleteService.current.getPlacePredictions(
      {
        input: val,
        sessionToken: sessionToken.current || undefined,
        types: types,
      },
      (results, status) => {
        if (placesLib && status === placesLib.PlacesServiceStatus.OK && results) {
          setPredictions(results);
          setIsOpen(true);
        } else {
          setPredictions([]);
          setIsOpen(false);
        }
      }
    );
  };

  const handleSelectPrediction = (prediction: google.maps.places.AutocompletePrediction) => {
    setInputValue(prediction.description);
    onChange(prediction.description);
    setIsOpen(false);
    setPredictions([]);
    
    // Refresh session token after a selection
    if (placesLib) {
      sessionToken.current = new placesLib.AutocompleteSessionToken();
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => {
          if (predictions.length > 0) setIsOpen(true);
        }}
        className="w-full bg-zinc-900/50 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
        placeholder={placeholder}
      />
      
      {isOpen && predictions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-zinc-800 border border-white/10 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {predictions.map((prediction) => (
            <li
              key={prediction.place_id}
              onClick={() => handleSelectPrediction(prediction)}
              className="px-4 py-3 hover:bg-zinc-700 cursor-pointer text-sm text-zinc-200 border-b border-white/5 last:border-0"
            >
              {prediction.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
