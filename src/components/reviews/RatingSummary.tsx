import { fetchWithAuth } from '../../utils/api';
import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface RatingSummaryProps {
  target_type: 'route' | 'ecosystem_entity';
  target_id: string;
  refreshTrigger?: number;
}

export default function RatingSummary({ target_type, target_id, refreshTrigger = 0 }: RatingSummaryProps) {
  const { t } = useLanguage();
  const [summary, setSummary] = useState({ average_rating: 0, total_reviews: 0, verified_reviews: 0 });

  useEffect(() => {
    fetchWithAuth(`/api/rating-summaries/${target_type}/${target_id}`)
      .then(res => res.json())
      .then(data => setSummary(data))
      .catch(err => console.error('Failed to fetch rating summary', err));
  }, [target_type, target_id, refreshTrigger]);

  return (
    <div className="glass-card p-6 flex items-center justify-between">
      <div>
        <h3 className="text-2xl font-bold">{summary.average_rating.toFixed(1)}</h3>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(i => (
            <Star key={i} className={`w-5 h-5 ${i <= Math.round(summary.average_rating) ? 'fill-yellow-400 text-yellow-400' : 'text-steel'}`} />
          ))}
        </div>
        <p className="text-steel">{summary.total_reviews} {t('review.title')}</p>
      </div>
      {summary.verified_reviews > 0 && (
        <div className="text-right">
          <p className="text-emerald-400 font-semibold">{summary.verified_reviews} {t('common.verified')}</p>
        </div>
      )}
    </div>
  );
}
