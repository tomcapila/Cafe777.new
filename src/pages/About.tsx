import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, Map, Globe, Heart, Activity } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function About() {
  const { t } = useLanguage();

  return (
    <div className="min-h-[calc(100dvh-5rem)] py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
      <div className="mb-16 text-center">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl md:text-6xl font-display font-black uppercase italic tracking-tighter text-chrome mb-4"
        >
          {t('about.title') || 'About'} <span className="text-primary">CAFE777</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl text-steel font-light max-w-2xl mx-auto"
        >
          {t('about.subtitle') || 'Connecting riders, businesses, and motorcycle culture worldwide.'}
        </motion.p>
      </div>

      <div className="space-y-16">
        <section>
          <h2 className="text-2xl font-display font-black uppercase italic text-chrome mb-6 flex items-center gap-3">
            <Globe className="text-primary" /> 
            {t('about.ourMission') || 'Our Mission'}
          </h2>
          <div className="bg-engine/50 border border-inverse/5 rounded-3xl p-8 shadow-lg">
            <p className="text-steel font-light leading-relaxed text-lg">
              {t('about.missionText') || 'CAFE777 was built for the rider. We believe the motorcycle community deserves a dedicated, modern platform where enthusiasts can log rides, join clubs, find the best scenic routes, and connect with mechanics, gear shops, and cafes. We bridge the gap between individual riders and the wider motorcycle ecosystem.'}
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-display font-black uppercase italic text-chrome mb-6">
            {t('about.whatWeDo') || 'What We Do'}
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: Map, title: t('about.feat1.title') || 'Route Discovery', desc: t('about.feat1.desc') || 'Find, rate, and share the most epic rides in your country.'},
              { icon: Users, title: t('about.feat2.title') || 'Moto Clubs', desc: t('about.feat2.desc') || 'Manage your riding group, organize events, and discover new riders.'},
              { icon: Activity, title: t('about.feat3.title') || 'Maintenance Logs', desc: t('about.feat3.desc') || 'Keep track of all your parts, repairs, and upcoming services in the digital Garage.'},
              { icon: Shield, title: t('about.feat4.title') || 'Ecosystem Connection', desc: t('about.feat4.desc') || 'Review and find verified motorcycle businesses from mechanics to local hangout cafes.'}
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + (i * 0.1) }}
                className="bg-oil border border-inverse/10 rounded-2xl p-6 hover:border-primary/50 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-chrome mb-2">{feature.title}</h3>
                <p className="text-steel text-sm leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section>
          <div className="bg-gradient-to-br from-primary/20 to-engine border border-primary/20 rounded-3xl p-8 text-center shadow-xl">
            <Heart className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-display font-black uppercase italic text-chrome mb-4">
              {t('about.joinRide') || 'Join The Ride'}
            </h2>
            <p className="text-steel mb-8 max-w-lg mx-auto">
              {t('about.joinText') || 'CAFE777 is continuously evolving. Every route you share, every review you leave, and every event you host helps build a stronger community. Let\'s hit the road.'}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
