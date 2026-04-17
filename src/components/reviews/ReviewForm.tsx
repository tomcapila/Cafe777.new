import { fetchWithAuth } from '../../utils/api';
import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface ReviewFormProps {
  reviewer_user_id: number;
  target_type: 'route' | 'ecosystem_entity';
  target_id: string;
  onReviewSubmitted: () => void;
}

export default function ReviewForm({ reviewer_user_id, target_type, target_id, onReviewSubmitted }: ReviewFormProps) {
  const { t } = useLanguage();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [review_text, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetchWithAuth('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer_user_id, target_type, target_id, rating, review_text }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        onReviewSubmitted();
        setRating(0);
        setReviewText('');
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || t('review.failed'));
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('Failed to submit review', error);
      if (error.name === 'AbortError') {
        setError(t('review.timeout'));
      } else {
        setError(t('review.error'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-6 space-y-4">
      <h3 className="text-lg font-semibold">{t('review.leave')}</h3>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`cursor-pointer ${star <= (hoveredRating || rating) ? 'fill-warning text-warning' : 'text-steel'}`}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoveredRating(star)}
            onMouseLeave={() => setHoveredRating(0)}
          />
        ))}
      </div>
      <textarea
        value={review_text || ''}
        onChange={(e) => setReviewText(e.target.value)}
        placeholder={t('review.placeholder')}
        className="w-full p-2 bg-oil border border-engine rounded-lg text-chrome"
        rows={3}
      />
      {error && <p className="text-accent text-sm">{error}</p>}
      <button
        type="submit"
        disabled={submitting || rating === 0}
        className="px-4 py-2 bg-primary text-inverse rounded-lg disabled:opacity-50"
      >
        {submitting ? t('common.loading') : t('review.submit')}
      </button>
    </form>
  );
}
