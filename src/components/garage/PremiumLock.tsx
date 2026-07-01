import React from 'react';
import { Crown } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface PremiumLockProps {
  unlocked: boolean;
  children: React.ReactNode;
  title?: string;
  description?: string;
  compact?: boolean;
}

/**
 * Wraps a premium-only area. When locked, the freemium user still SEES what
 * they're missing (children blurred behind an upgrade overlay) rather than the
 * feature being hidden. Presentational only — the caller decides `unlocked`
 * (server-side stripping is the real enforcement).
 *
 * The gold gradient mirrors the existing PremiumBadge component intentionally.
 */
export default function PremiumLock({ unlocked, children, title, description, compact }: PremiumLockProps) {
  const { t } = useLanguage();
  if (unlocked) return <>{children}</>;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none select-none blur-sm opacity-40" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-engine/70 backdrop-blur-[2px] p-4 text-center">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-r from-amber-400 to-yellow-600 text-chrome shadow-sm shadow-amber-900/20">
          <Crown className="w-4 h-4" fill="currentColor" />
        </span>
        <p className="text-xs font-display font-black uppercase tracking-wide text-chrome">
          {title || t('garage.premiumTitle')}
        </p>
        {!compact && (
          <p className="text-[11px] text-steel max-w-[220px] leading-snug">
            {description || t('garage.premiumDesc')}
          </p>
        )}
        <span className="mt-1 text-[10px] font-mono font-black uppercase tracking-widest text-primary">
          {t('garage.upgradeCta')}
        </span>
      </div>
    </div>
  );
}
