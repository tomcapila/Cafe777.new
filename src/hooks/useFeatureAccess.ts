import { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

export type Plan = 'freemium' | 'premium';

export interface FeatureAccess {
  [key: string]: Plan;
}

export function useFeatureAccess() {
  const [access, setAccess] = useState<FeatureAccess>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAccess() {
      try {
        const res = await fetchWithAuth('/api/feature-access');
        if (res.ok) {
          const data = await res.json();
          setAccess(data);
        }
      } catch (err) {
        console.error('Failed to fetch feature access:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchAccess();
  }, []);

  const canAccess = (feature: string, userPlan: string | undefined, userRole: string | undefined, userType?: string) => {
    if (userRole === 'admin') return true;
    
    if (feature === 'create_event' && userType === 'ecosystem') {
      return userPlan === 'premium';
    }

    const requiredPlan = access[feature] || 'freemium';
    if (requiredPlan === 'premium') {
      return userPlan === 'premium';
    }
    return true;
  };

  return { access, canAccess, isLoading };
}
