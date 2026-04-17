import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Eye, FileText, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-engine py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-steel hover:text-primary transition-colors mb-12 font-mono text-xs uppercase tracking-widest">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-8 sm:p-12"
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-primary/10 rounded-2xl">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl font-display font-black uppercase italic tracking-tighter text-chrome">Privacy Policy</h1>
          </div>

          <div className="space-y-8 text-steel font-light leading-relaxed">
            <section>
              <h2 className="text-xl font-display font-bold text-chrome uppercase italic mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                1. Introduction
              </h2>
              <p>
                Cafe 777 ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-display font-bold text-chrome uppercase italic mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                2. Information We Collect
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Personal Data:</strong> Name, email address, username, and profile information you provide.</li>
                <li><strong>Location Data:</strong> We collect real-time location data to provide features like route tracking, discovery, and stamp collection. You can disable this in your device settings.</li>
                <li><strong>Motorcycle Data:</strong> Information about your motorcycles and maintenance history.</li>
                <li><strong>Usage Data:</strong> Information about how you interact with our platform.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-display font-bold text-chrome uppercase italic mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                3. How We Use Your Information
              </h2>
              <p>
                We use your information to provide and improve our services, personalize your experience, process transactions, and communicate with you. We do not sell your personal data to third parties.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-display font-bold text-chrome uppercase italic mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                4. Data Protection (GDPR & LGPD)
              </h2>
              <p>
                We comply with the General Data Protection Regulation (GDPR) and the Lei Geral de Proteção de Dados (LGPD). You have the right to:
              </p>
              <ul className="list-disc pl-6 mt-4 space-y-2">
                <li>Access your personal data.</li>
                <li>Correct inaccurate data.</li>
                <li>Request deletion of your data ("Right to be Forgotten").</li>
                <li>Object to processing of your data.</li>
                <li>Data portability.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-display font-bold text-chrome uppercase italic mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                5. Security
              </h2>
              <p>
                We implement industry-standard security measures to protect your data. However, no method of transmission over the Internet is 100% secure.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-display font-bold text-chrome uppercase italic mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                6. Contact Us
              </h2>
              <p>
                If you have any questions about this Privacy Policy, please contact us at privacy@cafe777.com.
              </p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-inverse/10 text-center">
            <p className="text-xs font-mono uppercase tracking-widest text-steel">Last Updated: April 2026</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
