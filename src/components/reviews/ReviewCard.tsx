import { fetchWithAuth } from '../../utils/api';
import React, { useState } from 'react';
import { Star, CheckCircle, QrCode } from 'lucide-react';
import QRScanner from '../QRScanner';
import { useLanguage } from '../../contexts/LanguageContext';

interface Review {
  review_id: number;
  reviewer_user_id: number;
  username: string;
  profile_picture_url: string;
  rating: number;
  review_text: string;
  verification_status: 'verified' | 'unverified';
  created_at: string;
  target_type: string;
  target_id: string;
}

interface ReviewCardProps {
  review: Review;
  currentUser?: any;
  onReviewVerified?: () => void;
}

export const ReviewCard: React.FC<ReviewCardProps> = ({ review, currentUser, onReviewVerified }) => {
  const { t } = useLanguage();
  const [isScanning, setIsScanning] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleScan = async (data: string) => {
    setIsScanning(false);
    try {
      const parsed = JSON.parse(data);
      if (parsed.target_type === review.target_type && String(parsed.target_id) === String(review.target_id)) {
        setVerifying(true);
        const res = await fetchWithAuth(`/api/reviews/${review.review_id}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verification_method: 'QR' })
        });
        if (res.ok) {
          if (onReviewVerified) onReviewVerified();
        } else {
          alert(t('review.failed'));
        }
      } else {
        alert(t('review.qrMismatch'));
      }
    } catch (e) {
      alert(t('review.invalidQR'));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="glass-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={review.profile_picture_url} alt={review.username} className="w-10 h-10 rounded-full" />
          <div>
            <h4 className="font-semibold">{review.username}</h4>
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className={`w-4 h-4 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-steel'}`} />
              ))}
              {review.verification_status === 'verified' && (
                <span className="flex items-center gap-1 text-xs text-emerald-400 ml-2">
                  <CheckCircle className="w-3 h-3" /> {t('common.verified')}
                </span>
              )}
            </div>
          </div>
        </div>
        {currentUser && currentUser.id === review.reviewer_user_id && review.verification_status === 'unverified' && (
          review.target_type === 'route' || review.target_type === 'ride_route' ? (
            <span className="text-[10px] text-steel italic">{t('review.completeToVerify')}</span>
          ) : (
            <button
              onClick={() => setIsScanning(!isScanning)}
              disabled={verifying}
              className="flex items-center gap-1 text-xs bg-engine hover:bg-carbon text-chrome px-2 py-1 rounded transition-colors"
            >
              <QrCode className="w-3 h-3" />
              {isScanning ? t('common.cancel') : t('common.scan')}
            </button>
          )
        )}
      </div>
      <p className="text-chrome">{review.review_text}</p>
      <span className="text-xs text-steel">{review.created_at ? new Date(review.created_at.replace(' ', 'T') + 'Z').toLocaleDateString() : ''}</span>
      
      {isScanning && (
        <div className="mt-4 p-4 bg-carbon rounded-xl border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-sm font-semibold text-center flex-1">{t('review.scanLocation')}</h5>
            <button 
              onClick={() => handleScan(JSON.stringify({ target_type: review.target_type, target_id: review.target_id }))}
              className="text-[10px] bg-engine px-2 py-1 rounded text-steel hover:text-white"
            >
              {t('common.simulate')}
            </button>
          </div>
          <QRScanner onScanSuccess={handleScan} />
        </div>
      )}
    </div>
  );
};

export default ReviewCard;
