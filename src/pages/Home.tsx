import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Wrench, Users, MapPin, ShieldCheck, Zap } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-orange-500/20 via-zinc-950 to-zinc-950 -z-10" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-orange-400 text-sm font-medium mb-6">
              <Zap className="w-4 h-4" />
              <span>The Ultimate Rider Ecosystem</span>
            </div>
            <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-8 leading-[1.1]">
              Connect with the <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">
                Motorcycle World
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-zinc-400 mb-10 max-w-2xl leading-relaxed">
              Whether you're a rider building your virtual garage, or a business serving the community. 
              Create your unique profile and join the global network.
            </p>
            
            <div className="flex flex-wrap items-center gap-4">
              <Link 
                to="/register" 
                className="inline-flex items-center gap-2 bg-orange-500 text-zinc-950 px-6 py-3 rounded-full font-semibold hover:bg-orange-400 transition-colors"
              >
                Create Your Profile
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link 
                to="/profile/moto_garage_la" 
                className="inline-flex items-center gap-2 bg-white/5 text-white px-6 py-3 rounded-full font-semibold hover:bg-white/10 transition-colors border border-white/10"
              >
                View Ecosystem Demo
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-zinc-900/50 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Users className="w-6 h-6 text-orange-400" />}
              title="Rider Profiles"
              description="Showcase your virtual garage, share your rides, and connect with other enthusiasts."
            />
            <FeatureCard 
              icon={<Wrench className="w-6 h-6 text-orange-400" />}
              title="Ecosystem Network"
              description="Find trusted repair shops, dealerships, barbershops, and biker-friendly venues."
            />
            <FeatureCard 
              icon={<MapPin className="w-6 h-6 text-orange-400" />}
              title="Local Discovery"
              description="Discover the best routes, events, and businesses in your city."
            />
          </div>
        </div>
      </section>

      {/* Architecture Section */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-zinc-900 rounded-3xl p-8 sm:p-12 border border-white/10">
            <div className="flex items-center gap-3 mb-6">
              <ShieldCheck className="w-8 h-8 text-orange-500" />
              <h2 className="text-2xl font-bold">Architecture Roadmap</h2>
            </div>
            <div className="prose prose-invert max-w-none">
              <p className="text-zinc-400 text-lg">
                This prototype demonstrates the core functionality of the MotoConnect platform. 
                For the production application, we recommend the following architecture:
              </p>
              
              <div className="grid md:grid-cols-2 gap-8 mt-8">
                <div className="bg-zinc-950 p-6 rounded-2xl border border-white/5">
                  <h3 className="text-orange-400 font-semibold mb-4">Frontend Stack</h3>
                  <ul className="space-y-3 text-sm text-zinc-300">
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5" />
                      <span><strong>React Native (Expo)</strong> for iOS & Android apps</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5" />
                      <span><strong>Next.js</strong> for the Web platform (SEO optimization for profiles)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5" />
                      <span><strong>Tailwind CSS</strong> for responsive, consistent styling</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-zinc-950 p-6 rounded-2xl border border-white/5">
                  <h3 className="text-orange-400 font-semibold mb-4">Backend & Database</h3>
                  <ul className="space-y-3 text-sm text-zinc-300">
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5" />
                      <span><strong>Node.js / Express</strong> or Serverless Functions</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5" />
                      <span><strong>PostgreSQL</strong> (Relational DB is best for structured user/garage data)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5" />
                      <span><strong>Supabase / Firebase</strong> for Auth & Real-time features</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="bg-zinc-950 p-6 rounded-2xl border border-white/5 hover:border-orange-500/30 transition-colors group">
      <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <p className="text-zinc-400 leading-relaxed">{description}</p>
    </div>
  );
}
