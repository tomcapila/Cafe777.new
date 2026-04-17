import React from 'react';
import { NavLink } from 'react-router-dom';
import { Map, Compass, Book, Users, User, Camera, Calendar, Gauge, Crown } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useFeatureFlags } from '../contexts/FeatureFlagContext';

export default function BottomNavigation() {
  const { t } = useLanguage();
  const { flags } = useFeatureFlags();

  const navItems = [
    { to: '/discover', icon: Compass, label: 'Discover', flag: 'map' },
    { to: '/motorfeed', icon: Gauge, label: 'MotorFeed', flag: 'feed' },
    { to: '/events', icon: Calendar, label: 'Events', flag: 'events' },
    { to: '/scan', icon: Camera, label: 'Scan', flag: 'scanner' },
    { to: '/passport', icon: Book, label: 'Passport', flag: 'passport' },
    { to: '/clubs', icon: Users, label: 'Clubs', flag: 'clubs' },
    { to: '/ambassador', icon: Crown, label: 'Ambassador', flag: 'ambassador' },
    { to: '/profile', icon: User, label: 'Profile', flag: 'profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-engine/90 backdrop-blur-xl border-t border-inverse/5 h-20 px-1 sm:px-4 pb-safe">
      <div className="max-w-2xl mx-auto h-full flex items-center justify-between">
        {navItems.filter(item => flags[item.flag as keyof typeof flags]).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `
              flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all
              ${isActive ? 'text-primary' : 'text-steel hover:text-chrome'}
            `}
          >
            <item.icon className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[8px] sm:text-[10px] font-mono font-black uppercase tracking-widest leading-none text-center">
              {item.label}
            </span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
