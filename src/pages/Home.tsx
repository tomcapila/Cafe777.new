import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { MapPin, Navigation, Compass, Calendar, Users, Activity, ChevronRight, Zap, Play, Wrench, Route, Shield, Heart, Flag, Bike, Award } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import Gauges from '../components/Gauges';

export default function Home() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-asphalt">
      {/* 1. Hero Section */}
      <section className="relative h-[85vh] min-h-[600px] w-full flex items-center justify-center overflow-hidden">
        {/* Cinematic Background */}
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1558981806-ec527fa84c39?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center bg-no-repeat opacity-60 mix-blend-luminosity" />
        <div className="absolute inset-0 bg-gradient-to-b from-asphalt/40 via-asphalt/60 to-asphalt" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#141414_100%)] opacity-80" />
        
        <div className="relative z-20 max-w-5xl mx-auto px-6 text-center mt-16">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-5xl md:text-7xl font-display font-black uppercase italic text-white tracking-tighter mb-6 drop-shadow-2xl"
          >
            {t('home.hero.title')}
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="text-lg md:text-xl text-steel font-light max-w-3xl mx-auto mb-10 leading-relaxed"
          >
            {t('home.hero.subtitle')}
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link 
              to="/onboarding" 
              className="w-full sm:w-auto px-8 py-4 bg-primary text-asphalt font-display font-black uppercase italic tracking-widest text-sm rounded-none hover:bg-white transition-all shadow-[0_0_30px_rgba(255,85,0,0.3)] hover:shadow-[0_0_40px_rgba(255,255,255,0.4)] skew-x-[-10deg]"
            >
              <span className="block skew-x-[10deg]">{t('home.hero.cta.join')}</span>
            </Link>
            <Link 
              to="/discover" 
              className="w-full sm:w-auto px-8 py-4 bg-transparent border border-white/20 text-white font-display font-black uppercase italic tracking-widest text-sm rounded-none hover:bg-white/10 transition-all skew-x-[-10deg]"
            >
              <span className="block skew-x-[10deg]">{t('home.hero.cta.explore')}</span>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Stats Gauges Section */}
      <section className="py-16 bg-asphalt relative z-10 border-t border-white/5 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,85,0,0.05)_0%,transparent_70%)]" />
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-12">
            <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-steel mb-2">{t('home.momentum.title')}</h2>
            <p className="text-xs text-steel/60 font-mono uppercase tracking-widest mb-4">{t('home.momentum.subtitle')}</p>
            <div className="w-12 h-0.5 bg-primary mx-auto" />
          </div>
          <Gauges />
        </div>
      </section>

      {/* 2. The 4 Pillars Section */}
      <section className="py-24 bg-asphalt relative z-10 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Navigation, title: t('home.pillars.riding.title'), desc: t('home.pillars.riding.desc') },
              { icon: Users, title: t('home.pillars.community.title'), desc: t('home.pillars.community.desc') },
              { icon: Wrench, title: t('home.pillars.machines.title'), desc: t('home.pillars.machines.desc') },
              { icon: MapPin, title: t('home.pillars.places.title'), desc: t('home.pillars.places.desc') }
            ].map((pillar, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-carbon/50 border border-white/5 p-8 hover:border-primary/30 transition-colors group"
              >
                <pillar.icon className="w-10 h-10 text-steel group-hover:text-primary transition-colors mb-6" strokeWidth={1.5} />
                <h3 className="text-xl font-display font-black uppercase italic text-white mb-3 tracking-tight">{pillar.title}</h3>
                <p className="text-sm text-steel font-light leading-relaxed">{pillar.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. The 4 Core Principles Section */}
      <section className="py-32 relative bg-carbon overflow-hidden border-y border-white/5">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/asphalt-pattern.png')] opacity-20 mix-blend-overlay" />
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-display font-black uppercase italic text-white tracking-tighter mb-4">{t('home.code.title')}</h2>
            <div className="w-16 h-1 bg-primary mx-auto" />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 md:gap-12 max-w-4xl mx-auto">
            {[
              { title: t('home.code.respect.title'), desc: t('home.code.respect.desc'), icon: Shield },
              { title: t('home.code.equality.title'), desc: t('home.code.equality.desc'), icon: Activity },
              { title: t('home.code.honor.title'), desc: t('home.code.honor.desc'), icon: Award },
              { title: t('home.code.brotherhood.title'), desc: t('home.code.brotherhood.desc'), icon: Heart }
            ].map((principle, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex flex-col items-center text-center p-6"
              >
                <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center mb-6 bg-asphalt shadow-inner">
                  <principle.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl font-display font-black uppercase italic text-white mb-3 tracking-widest">{principle.title}</h3>
                <p className="text-steel font-mono text-xs uppercase tracking-widest leading-relaxed">{principle.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Platform Value Section */}
      <section className="py-24 bg-asphalt relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1 grid grid-cols-2 gap-4">
              <img src="https://images.unsplash.com/photo-1558981403-c5f9899a28bc?q=80&w=800&auto=format&fit=crop" alt="Riders" className="rounded-none w-full h-64 object-cover grayscale hover:grayscale-0 transition-all duration-700" />
              <img src="https://images.unsplash.com/photo-1449426468159-d96dbf08f19f?q=80&w=800&auto=format&fit=crop" alt="Motorcycle" className="rounded-none w-full h-64 object-cover grayscale hover:grayscale-0 transition-all duration-700 mt-8" />
            </div>
            
            <div className="order-1 lg:order-2">
              <h2 className="text-3xl md:text-5xl font-display font-black uppercase italic text-white tracking-tighter mb-8">
                {t('home.ecosystem.title')}
              </h2>
              <div className="space-y-8">
                {[
                  { title: t('home.ecosystem.routes.title'), desc: t('home.ecosystem.routes.desc'), icon: Route },
                  { title: t('home.ecosystem.connect.title'), desc: t('home.ecosystem.connect.desc'), icon: Users },
                  { title: t('home.ecosystem.garage.title'), desc: t('home.ecosystem.garage.desc'), icon: Bike },
                  { title: t('home.ecosystem.events.title'), desc: t('home.ecosystem.events.desc'), icon: Calendar }
                ].map((item, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-12 h-12 shrink-0 bg-carbon border border-white/10 flex items-center justify-center">
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-lg font-display font-bold uppercase italic text-white mb-1">{item.title}</h4>
                      <p className="text-sm text-steel font-light">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Final CTA Section */}
      <section className="py-32 relative bg-carbon overflow-hidden border-t border-white/5">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1558981001-1995369a39cd?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-luminosity" />
        <div className="absolute inset-0 bg-gradient-to-t from-asphalt via-asphalt/80 to-transparent" />
        
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-6xl font-display font-black uppercase italic text-white tracking-tighter mb-6">
            {t('home.cta.title')}
          </h2>
          <p className="text-steel font-mono text-sm uppercase tracking-[0.2em] mb-12">
            {t('home.cta.subtitle')}
          </p>
          <Link 
            to="/onboarding" 
            className="inline-block px-10 py-5 bg-primary text-asphalt font-display font-black uppercase italic tracking-widest text-lg rounded-none hover:bg-white transition-all shadow-[0_0_40px_rgba(255,85,0,0.4)] hover:shadow-[0_0_60px_rgba(255,255,255,0.5)] skew-x-[-10deg]"
          >
            <span className="block skew-x-[10deg]">{t('home.cta.btn')}</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
