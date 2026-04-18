import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MessageSquare, Bike, Calendar, Route, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function FloatingActionButton() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const actions = [
    { icon: MessageSquare, label: 'Post', onClick: () => navigate('/feed?action=create'), color: 'bg-info' },
    { icon: Bike, label: 'Motorcycle', onClick: () => navigate('/profile'), color: 'bg-success' },
    { icon: Route, label: 'Route', onClick: () => navigate('/roads'), color: 'bg-accent' },
    { icon: Calendar, label: 'Event', onClick: () => navigate('/events'), color: 'bg-primary' },
  ];

  return (
    <div className="fixed bottom-24 right-6 z-[60]">
      <AnimatePresence>
        {isOpen && (
          <div className="flex flex-col gap-3 mb-4 items-end">
            {actions.map((action, index) => (
              <motion.button
                key={action.label}
                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.5, y: 20 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => {
                  action.onClick();
                  setIsOpen(false);
                }}
                className="flex items-center gap-3 group"
              >
                <span className="bg-oil border border-inverse/10 px-3 py-1.5 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest text-chrome opacity-0 group-hover:opacity-100 transition-opacity shadow-2xl">
                  {action.label}
                </span>
                <div className={`${action.color} p-3 rounded-2xl text-white shadow-xl shadow-inverse/50 hover:scale-110 transition-transform`}>
                  <action.icon className="w-5 h-5" />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-4 rounded-2xl shadow-2xl transition-all duration-300 active:scale-90 ${
          isOpen ? 'bg-oil text-chrome rotate-45' : 'bg-primary text-inverse shadow-primary/20'
        }`}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </button>

      {isOpen && (
        <div 
          className="fixed inset-0 bg-engine/60 backdrop-blur-sm -z-10"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
