import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Calendar, Award, Star, Shield, ChevronRight } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function Passport() {
  const { t } = useLanguage();
  const [activeCategory, setActiveCategory] = useState<'cities' | 'routes' | 'events' | 'ambassadors' | 'rare'>('cities');

  const categories = [
    { id: 'cities', label: t('passport.cat.cities'), icon: MapPin },
    { id: 'routes', label: t('passport.cat.routes'), icon: Shield },
    { id: 'events', label: t('passport.cat.events'), icon: Calendar },
    { id: 'ambassadors', label: t('passport.cat.ambassadors'), icon: Star },
    { id: 'rare', label: t('passport.cat.rare'), icon: Award },
  ];

  // Mock stamps data
  const stamps = [
    { id: 1, location: 'Belo Horizonte', entity: 'Café777 HQ', date: '2024-03-10', rarity: 'common', category: 'cities' },
    { id: 2, location: 'Estrada Real', entity: 'Road Captain', date: '2024-02-15', rarity: 'rare', category: 'routes' },
    { id: 3, location: 'Biker Fest 2024', entity: 'Event Organizer', date: '2024-01-20', rarity: 'epic', category: 'events' },
  ];

  const filteredStamps = stamps.filter(s => s.category === activeCategory);

  return (
    <div className="min-h-full pb-32">
      <div className="max-w-4xl mx-auto px-4 pt-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-display font-black uppercase italic tracking-tighter text-white">
              {t('passport.title')} <span className="text-primary">Passport</span>
            </h1>
            <p className="text-steel font-mono text-xs uppercase tracking-widest mt-2">{t('passport.subtitle')}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-display font-black text-primary">12</div>
            <div className="text-[10px] font-mono text-steel uppercase tracking-widest">{t('passport.stampsEarned')}</div>
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar mb-8">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id as any)}
              className={`
                flex items-center gap-2 px-6 py-3 rounded-2xl font-mono text-[10px] font-black uppercase tracking-widest transition-all shrink-0
                ${activeCategory === cat.id 
                  ? 'bg-primary text-asphalt shadow-lg shadow-primary/20' 
                  : 'bg-carbon text-steel border border-white/5 hover:border-white/10'}
              `}
            >
              <cat.icon className="w-4 h-4" />
              {cat.label}
            </button>
          ))}
        </div>

        {/* Passport Book View */}
        <div className="grid sm:grid-cols-2 gap-6">
          {filteredStamps.length > 0 ? (
            filteredStamps.map((stamp) => (
              <motion.div
                key={stamp.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-card p-6 relative overflow-hidden group"
              >
                <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 blur-3xl opacity-20 transition-opacity group-hover:opacity-40
                  ${stamp.rarity === 'common' ? 'bg-steel' : ''}
                  ${stamp.rarity === 'rare' ? 'bg-blue-500' : ''}
                  ${stamp.rarity === 'epic' ? 'bg-purple-500' : ''}
                `} />
                
                <div className="flex items-start justify-between mb-6 relative z-10">
                  <div className="w-16 h-16 rounded-full bg-asphalt border-4 border-white/5 flex items-center justify-center shadow-inner">
                    <MapPin className={`w-8 h-8 ${
                      stamp.rarity === 'common' ? 'text-steel' : 
                      stamp.rarity === 'rare' ? 'text-blue-400' : 
                      'text-purple-400'
                    }`} />
                  </div>
                  <div className={`text-[8px] font-mono font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border
                    ${stamp.rarity === 'common' ? 'text-steel border-steel/20 bg-steel/5' : ''}
                    ${stamp.rarity === 'rare' ? 'text-blue-400 border-blue-400/20 bg-blue-400/5' : ''}
                    ${stamp.rarity === 'epic' ? 'text-purple-400 border-purple-400/20 bg-purple-400/5' : ''}
                  `}>
                    {t(`passport.rarity.${stamp.rarity}`)}
                  </div>
                </div>

                <div className="relative z-10">
                  <h3 className="text-xl font-display font-black uppercase italic tracking-tight text-white mb-1">{stamp.location}</h3>
                  <p className="text-[10px] font-mono text-steel uppercase tracking-widest mb-4">{t('passport.issuedBy')} {stamp.entity}</p>
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <span className="text-[10px] font-mono text-steel uppercase tracking-widest">{stamp.date}</span>
                    <ChevronRight className="w-4 h-4 text-steel group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="sm:col-span-2 py-20 text-center glass-card border-dashed border-white/10">
              <div className="w-16 h-16 bg-carbon rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-steel" />
              </div>
              <h3 className="text-xl font-display font-black uppercase italic tracking-tight text-white mb-2">{t('passport.noStamps')}</h3>
              <p className="text-steel font-mono text-xs uppercase tracking-widest">{t('passport.exploreMap')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
