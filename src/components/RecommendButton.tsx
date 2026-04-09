import { fetchWithAuth } from '../utils/api';
import React, { useState, useEffect } from 'react';
import { Star, Check } from 'lucide-react';

interface RecommendButtonProps {
  item_id: string;
  item_name: string;
  type: 'road' | 'shop';
  className?: string;
  image_url?: string;
  item_description?: string;
}

export default function RecommendButton({ item_id, item_name, type, className = "flex items-center gap-2 text-primary hover:text-oil font-display font-bold text-xs uppercase tracking-widest transition-all", image_url, item_description }: RecommendButtonProps) {
  const [isRecommending, setIsRecommending] = useState(false);
  const [isRecommended, setIsRecommended] = useState(false);

  // Check if already recommended
  useEffect(() => {
    const checkStatus = async () => {
      const storedUser = localStorage.getItem('user');
      if (!storedUser) return;
      const user = JSON.parse(storedUser);
      
      try {
        const res = await fetchWithAuth(`/api/profile/${encodeURIComponent(user.username)}`);
        if (res.ok) {
          const data = await res.json();
          const recommended = data.recommendations?.some(
            (rec: any) => rec.item_id === item_id && rec.type === type
          );
          setIsRecommended(!!recommended);
        }
      } catch (err) {
        console.error(err);
      }
    };
    checkStatus();
  }, [item_id, type]);

  const handleRecommend = async () => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      alert('Please log in to recommend items.');
      return;
    }
    const user = JSON.parse(storedUser);

    setIsRecommending(true);
    try {
      const res = await fetchWithAuth('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          type,
          item_id,
          item_name,
          description: '',
          image_url,
          item_description
        }),
      });
      if (res.ok) {
        setIsRecommended(true);
      } else {
        const data = await res.json();
        if (data.error === "You have already recommended this item.") {
          setIsRecommended(true);
        } else {
          alert('Failed to recommend.');
        }
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred.');
    } finally {
      setIsRecommending(false);
    }
  };

  if (isRecommended) {
    return (
      <button 
        disabled
        className={`${className} opacity-50 cursor-not-allowed`}
      >
        <Check className="w-4 h-4" />
        Recommended
      </button>
    );
  }

  return (
    <button 
      onClick={handleRecommend}
      disabled={isRecommending}
      className={className}
    >
      <Star className="w-4 h-4" />
      {isRecommending ? 'Recommending...' : 'Recommend'}
    </button>
  );
}
