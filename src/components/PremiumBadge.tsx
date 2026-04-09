import React from 'react';
import { Crown } from 'lucide-react';
import { motion } from 'motion/react';

interface PremiumBadgeProps {
  className?: string;
  size?: number;
}

const PremiumBadge: React.FC<PremiumBadgeProps> = ({ className = "", size = 14 }) => {
  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`inline-flex items-center justify-center bg-gradient-to-r from-amber-400 to-yellow-600 text-white rounded-full p-0.5 shadow-sm shadow-amber-900/20 ml-1.5 align-middle ${className}`}
      title="Premium Member"
    >
      <Crown size={size} className="drop-shadow-sm" fill="currentColor" />
    </motion.span>
  );
};

export default PremiumBadge;
