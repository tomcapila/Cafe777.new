import React, { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { fetchWithAuth } from '../../utils/api';
import { useLanguage } from '../../contexts/LanguageContext';

interface MapRatingProps {
  type: string;
  id: string;
  onClick?: () => void;
  refreshTrigger?: number;
}

export default function MapRating({ type, id, onClick, refreshTrigger = 0 }: MapRatingProps) {
  const { t } = useLanguage();
  const [summary, setSummary] = useState({ average_rating: 0, total_reviews: 0 });

  useEffect(() => {
    fetchWithAuth(`/api/rating-summaries/${type}/${id}`)
      .then(res => res.json())
      .then(setSummary)
      .catch(console.error);
  }, [type, id, refreshTrigger]);

  return (
    <button 
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick();
      }}
      className="flex items-center gap-1 text-yellow-400 hover:bg-white/5 px-2 py-1 rounded-lg transition-colors -ml-2"
    >
      <Star className={`w-3 h-3 ${summary.total_reviews > 0 ? 'fill-current' : 'text-steel'}`} />
      <span className="text-[10px] font-mono font-bold text-chrome">
        {summary.total_reviews > 0 
          ? `${summary.average_rating.toFixed(1)} (${summary.total_reviews})` 
          : t('review.leave')}
      </span>
    </button>
  );
}
