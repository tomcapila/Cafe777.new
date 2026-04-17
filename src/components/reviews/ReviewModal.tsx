import { fetchWithAuth } from '../../utils/api';
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import RatingSummary from './RatingSummary';
import ReviewCard from './ReviewCard';
import ReviewForm from './ReviewForm';
import { useLanguage } from '../../contexts/LanguageContext';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  target_type: 'route' | 'ecosystem_entity';
  target_id: string;
  target_name: string;
  onReviewAdded?: () => void;
}

export default function ReviewModal({ isOpen, onClose, target_type, target_id, target_name, onReviewAdded }: ReviewModalProps) {
  const { t } = useLanguage();
  const [reviews, setReviews] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const fetchReviews = async () => {
    try {
      const res = await fetchWithAuth(`/api/reviews/${target_type}/${target_id}`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data);
      }
    } catch (err) {
      console.error('Failed to fetch reviews', err);
    }
  };

  const handleReviewSubmitted = () => {
    fetchReviews();
    setRefreshKey(prev => prev + 1);
    if (onReviewAdded) onReviewAdded();
  };

  useEffect(() => {
    if (isOpen) {
      fetchReviews();
    }
  }, [isOpen, target_type, target_id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-engine/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-engine border border-inverse/10 rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-inverse/5">
          <h2 className="font-display font-black uppercase italic text-xl text-chrome tracking-tight truncate pr-4">
            {t('review.all')}: {target_name}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-oil flex items-center justify-center text-steel hover:text-chrome hover:bg-engine transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
          <RatingSummary target_type={target_type} target_id={target_id} refreshTrigger={refreshKey} />

          {user ? (
            <div className="bg-oil/50 rounded-2xl p-6 border border-inverse/5">
              <h3 className="text-sm font-bold text-chrome mb-4">{t('review.leave')}</h3>
              <ReviewForm 
                reviewer_user_id={user.id} 
                target_type={target_type} 
                target_id={target_id} 
                onReviewSubmitted={handleReviewSubmitted} 
              />
            </div>
          ) : (
            <div className="text-center p-4 bg-oil/50 rounded-2xl border border-inverse/5">
              <p className="text-sm text-steel">{t('login.welcome')} - {t('login.subtitle')}</p>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-chrome">{t('review.all')}</h3>
            {reviews.length === 0 ? (
              <p className="text-sm text-steel text-center py-8">{t('review.noFound')}</p>
            ) : (
              reviews.map(review => (
                <ReviewCard 
                  key={review.review_id} 
                  review={review} 
                  currentUser={user}
                  onReviewVerified={handleReviewSubmitted}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
