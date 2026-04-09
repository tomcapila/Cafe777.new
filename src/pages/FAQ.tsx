import React from 'react';
import { motion } from 'framer-motion';
import { HelpCircle, Mail, Instagram, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

export default function FAQ() {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);
  const { t } = useLanguage();

  const faqs = [
    {
      question: t('faq.q1'),
      answer: t('faq.a1')
    },
    {
      question: t('faq.q2'),
      answer: t('faq.a2')
    },
    {
      question: t('faq.q3'),
      answer: t('faq.a3')
    },
    {
      question: t('faq.q4'),
      answer: t('faq.a4')
    }
  ];

  return (
    <div className="min-h-[calc(100dvh-5rem)] bg-asphalt pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <HelpCircle className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-black text-3xl uppercase italic tracking-tight text-white">{t('faq.title')}</h1>
            <p className="text-steel font-mono text-xs uppercase tracking-widest">{t('faq.subtitle')}</p>
          </div>
        </div>

        <div className="space-y-4 mb-12">
          {faqs.map((faq, index) => (
            <div 
              key={index}
              className="glass-card border border-white/5 rounded-2xl overflow-hidden transition-all duration-300"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
              >
                <span className="font-bold text-chrome">{faq.question}</span>
                {openIndex === index ? (
                  <ChevronUp className="w-5 h-5 text-primary shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-steel shrink-0" />
                )}
              </button>
              
              {openIndex === index && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-6 pb-4 text-steel leading-relaxed"
                >
                  {faq.answer}
                </motion.div>
              )}
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <a 
            href="mailto:support@cafe777.com"
            className="glass-card p-6 rounded-3xl border border-white/5 hover:border-primary/30 transition-all group flex flex-col items-center text-center"
          >
            <div className="w-12 h-12 rounded-full bg-carbon flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-bold text-white mb-2">{t('faq.emailUs')}</h3>
            <p className="text-sm text-steel">support@cafe777.com</p>
          </a>

          <a 
            href="https://instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            className="glass-card p-6 rounded-3xl border border-white/5 hover:border-primary/30 transition-all group flex flex-col items-center text-center"
          >
            <div className="w-12 h-12 rounded-full bg-carbon flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Instagram className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-bold text-white mb-2">{t('faq.instagram')}</h3>
            <p className="text-sm text-steel">@cafe777.app</p>
          </a>
        </div>
      </div>
    </div>
  );
}
