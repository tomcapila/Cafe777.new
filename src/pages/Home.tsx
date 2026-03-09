import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowRight, Wrench, Users, MapPin, ShieldCheck, Zap } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function Home() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen grid-pattern">
      {/* Hero Section */}
      <section className="relative pt-40 pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-zinc-950 to-zinc-950 -z-10" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-4xl"
          >
            <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-primary/5 border border-primary/20 text-primary text-[10px] font-mono font-black uppercase tracking-[0.3em] mb-10 shadow-xl shadow-primary/5">
              <Zap className="w-3 h-3" />
              <span>{t('home.hero.badge')}</span>
            </div>
            <h1 className="text-7xl sm:text-9xl font-display font-black tracking-tighter mb-10 leading-[0.85] uppercase italic">
              <span className="text-white block mb-2">THE NEW</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-primary via-oil to-accent">
                {t('home.hero.title')}
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-zinc-500 mb-12 max-w-2xl leading-relaxed font-light italic">
              {t('home.hero.subtitle')}
            </p>
            
            <div className="flex flex-wrap items-center gap-6">
              <Link 
                to="/register" 
                className="btn-primary px-10 py-5 text-lg"
              >
                {t('home.hero.cta')}
                <ArrowRight className="ml-3 w-6 h-6 inline group-hover:translate-x-2 transition-transform" />
              </Link>
              <Link 
                to="/profile/moto_garage_la" 
                className="btn-secondary px-10 py-5 text-lg"
              >
                {t('home.hero.demo')}
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-32 bg-zinc-950/50 border-y border-white/5 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl sm:text-6xl font-display font-black uppercase italic tracking-tighter text-white mb-6">
              Platform <span className="text-primary">Features</span>
            </h2>
            <p className="text-xl text-zinc-500 max-w-3xl mx-auto font-light italic">
              Everything you need to connect with the motorcycle community, manage your garage, and discover new places.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            <FeatureCard 
              image="https://picsum.photos/seed/riders/800/600"
              title={t('home.features.riders.title')}
              description="Create your unique rider profile. Showcase your virtual garage, log maintenance history, and connect with fellow enthusiasts."
            />
            <FeatureCard 
              image="https://picsum.photos/seed/ecosystem/800/600"
              title={t('home.features.ecosystem.title')}
              description="Discover top-rated mechanics, dealerships, gear shops, and biker-friendly venues in your area."
            />
            <FeatureCard 
              image="https://picsum.photos/seed/map/800/600"
              title={t('home.features.discovery.title')}
              description="Explore our interactive map to find nearby motorcycle-related businesses, popular ride routes, and meeting spots."
            />
            <FeatureCard 
              image="https://picsum.photos/seed/events/800/600"
              title="Community Events"
              description="Stay updated with local rides, meetups, and showcases. RSVP to events and see who else is attending."
            />
            <FeatureCard 
              image="https://picsum.photos/seed/admin/800/600"
              title="Admin Dashboard"
              description="Comprehensive moderation tools for platform administrators to manage users, approve events, and oversee content."
            />
            <FeatureCard 
              image="https://picsum.photos/seed/mobile/800/600"
              title="Mobile Optimized"
              description="A fully responsive design ensuring a seamless experience whether you're on your desktop or checking your phone on the road."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ image, title, description }: { image: string, title: string, description: string }) {
  return (
    <div className="glass-card p-0 hover:border-primary/50 transition-all group relative overflow-hidden rounded-3xl">
      <div className="h-48 overflow-hidden">
        <img src={image} alt={title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
      </div>
      <div className="p-10">
        <h3 className="text-3xl font-display font-black mb-6 uppercase italic tracking-tighter text-white">{title}</h3>
        <p className="text-zinc-500 leading-relaxed font-light italic text-lg">{description}</p>
      </div>
    </div>
  );
}
