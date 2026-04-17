import React, { useState, useEffect } from 'react';
import { Search, MapPin, Phone, Globe, ChevronRight, Wrench, Navigation } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../utils/api';
import { useLanguage } from '../contexts/LanguageContext';
import LocationAutocomplete from '../components/LocationAutocomplete';

interface SearchResult {
  id: number;
  username: string;
  profile_picture_url: string;
  company_name: string;
  full_address: string;
  service_category: string;
  lat: number;
  lng: number;
  details: string;
  phone?: string;
  website?: string;
}

export default function PartsAndService() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!keyword.trim() && !location.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.append('keyword', keyword.trim());
      if (location.trim()) params.append('location', location.trim());
      
      const response = await fetchWithAuth(`/api/search/parts-and-service?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setResults(data);
      } else {
        console.error('Search failed');
        setResults([]);
      }
    } catch (error) {
      console.error('Error searching parts and service:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const formatCategory = (category: string) => {
    switch (category) {
      case 'repair': return t('partsAndService.category.repair');
      case 'dealership': return t('partsAndService.category.dealership');
      case 'parts': return t('partsAndService.category.parts');
      case 'parts_store': return t('partsAndService.category.parts_store');
      default: return category;
    }
  };

  return (
    <div className="min-h-screen bg-engine text-chrome pb-24">
      <div className="p-4">
        <h1 className="text-2xl font-black uppercase tracking-tight mb-2 flex items-center gap-2">
          <Wrench className="w-6 h-6 text-primary" />
          {t('partsAndService.title')}
        </h1>
        <p className="text-steel text-sm mb-6">{t('partsAndService.subtitle')}</p>

        <form onSubmit={handleSearch} className="space-y-4 mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-steel" />
            <input
              type="text"
              autoCapitalize="sentences"
              placeholder={t('partsAndService.keywordsPlaceholder')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full bg-oil border-2 border-inverse/10 rounded-xl py-3 pl-12 pr-4 text-chrome placeholder:text-steel focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          
          <div className="relative">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-steel z-10" />
            <LocationAutocomplete
              value={location}
              onChange={(value) => setLocation(value)}
              placeholder={t('partsAndService.locationPlaceholder')}
              className="pl-12"
            />
          </div>

          <button
            type="submit"
            disabled={isSearching || (!keyword.trim() && !location.trim())}
            className="w-full bg-primary text-inverse font-bold py-3 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSearching ? (
              <div className="w-5 h-5 border-2 border-inverse/30 border-t-inverse rounded-full animate-spin" />
            ) : (
              <>
                <Search className="w-5 h-5" />
                {t('partsAndService.search')}
              </>
            )}
          </button>
        </form>

        <div className="space-y-4">
          {isSearching ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : hasSearched && results.length === 0 ? (
            <div className="text-center py-12 bg-oil/50 rounded-2xl border border-inverse/5">
              <Wrench className="w-12 h-12 text-steel mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-bold mb-2">{t('partsAndService.noResults')}</h3>
              <p className="text-steel text-sm">{t('partsAndService.tryAdjusting')}</p>
            </div>
          ) : (
            results.map((result) => (
              <motion.div
                key={result.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-oil rounded-2xl border border-inverse/10 overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start gap-4 mb-4">
                    <div 
                      className="w-16 h-16 rounded-xl bg-engine border border-inverse/10 flex-shrink-0 bg-cover bg-center cursor-pointer"
                      style={{ backgroundImage: `url(${result.profile_picture_url || 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&q=80&w=200'})` }}
                      onClick={() => navigate(`/profile/${result.username}`)}
                    />
                    <div className="flex-1 min-w-0">
                      <h3 
                        className="font-bold text-lg truncate cursor-pointer hover:text-primary transition-colors"
                        onClick={() => navigate(`/profile/${result.username}`)}
                      >
                        {result.company_name}
                      </h3>
                      <span className="inline-block px-2 py-1 bg-inverse/10 rounded text-xs font-mono text-steel uppercase tracking-wider mt-1">
                        {formatCategory(result.service_category)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    {result.full_address && (
                      <div className="flex items-start gap-2 text-sm text-steel">
                        <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{result.full_address}</span>
                      </div>
                    )}
                    {result.phone && (
                      <div className="flex items-center gap-2 text-sm text-steel">
                        <Phone className="w-4 h-4 shrink-0" />
                        <a href={`tel:${result.phone}`} className="hover:text-primary transition-colors">{result.phone}</a>
                      </div>
                    )}
                    {result.website && (
                      <div className="flex items-center gap-2 text-sm text-steel">
                        <Globe className="w-4 h-4 shrink-0" />
                        <a href={result.website} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors truncate">
                          {result.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/profile/${result.username}`)}
                      className="flex-1 bg-inverse/5 hover:bg-inverse/10 text-chrome py-2 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      {t('partsAndService.viewProfile')}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    {result.lat && result.lng && (
                      <button
                        onClick={() => navigate(`/discover?lat=${result.lat}&lng=${result.lng}&zoom=15`)}
                        className="px-4 bg-primary/10 hover:bg-primary/20 text-primary py-2 rounded-xl text-sm font-bold transition-colors flex items-center justify-center"
                        title={t('partsAndService.viewOnMap')}
                      >
                        <Navigation className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
