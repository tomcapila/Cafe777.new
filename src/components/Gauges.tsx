import { fetchWithAuth } from '../utils/api';
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import * as d3 from 'd3';

import { useLanguage } from '../contexts/LanguageContext';

interface GaugeProps {
  value: number;
  max: number;
  label: string;
  unit: string;
  color: string;
  id: string;
}

const Gauge = ({ value, max, label, unit, color, id }: GaugeProps) => {
  const radius = 80;
  const strokeWidth = 12;
  const innerRadius = radius - strokeWidth;
  
  // Angle range: -135 to 135 degrees (270 degrees total)
  const startAngle = -135 * (Math.PI / 180);
  const endAngle = 135 * (Math.PI / 180);
  
  const arcScale = d3.scaleLinear()
    .domain([0, max])
    .range([startAngle, endAngle]);

  const currentAngle = arcScale(Math.min(value, max));
  const rotationDegrees = (currentAngle * 180) / Math.PI;

  // Generate ticks
  const ticks = d3.range(0, max + 1, max / 10);

  return (
    <div className="flex flex-col items-center group">
      <div className="relative w-48 h-48 flex items-center justify-center">
        {/* Outer Ring */}
        <div className="absolute inset-0 rounded-full border-4 border-asphalt shadow-[inset_0_0_20px_rgba(0,0,0,0.8),0_0_30px_rgba(0,0,0,0.5)] bg-carbon" />
        
        {/* Glass Effect Overlay */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/5 to-transparent pointer-events-none z-30" />
        
        <svg width="180" height="180" viewBox="-90 -90 180 180" className="relative z-10 overflow-visible">
          {/* Background Arc */}
          <path
            d={d3.arc()({
              innerRadius,
              outerRadius: radius,
              startAngle,
              endAngle,
            }) || ""}
            fill="#1a1a1a"
          />
          
          {/* Redline Arc */}
          <path
            d={d3.arc()({
              innerRadius,
              outerRadius: radius,
              startAngle: arcScale(max * 0.85),
              endAngle: endAngle,
            }) || ""}
            fill="#ff0000"
            opacity="0.2"
          />
          
          {/* Progress Arc */}
          <path
            d={d3.arc()({
              innerRadius,
              outerRadius: radius,
              startAngle,
              endAngle: currentAngle,
            }) || ""}
            fill={color}
            className="transition-all duration-1000 ease-out"
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          />

          {/* Ticks */}
          {ticks.map((tick, i) => {
            const angle = arcScale(tick);
            const x1 = Math.sin(angle) * (innerRadius - 2);
            const y1 = -Math.cos(angle) * (innerRadius - 2);
            const x2 = Math.sin(angle) * (innerRadius - 12);
            const y2 = -Math.cos(angle) * (innerRadius - 12);
            
            return (
              <g key={i}>
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="white"
                  strokeWidth={tick >= max * 0.85 ? "2" : "1"}
                  opacity={tick >= max * 0.85 ? "0.6" : "0.3"}
                />
                {i % 2 === 0 && (
                  <text
                    x={Math.sin(angle) * (innerRadius - 22)}
                    y={-Math.cos(angle) * (innerRadius - 22)}
                    fill="white"
                    fontSize="8"
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    opacity="0.5"
                    className="font-mono font-bold"
                  >
                    {Math.round(tick)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Needle */}
          <motion.g
            initial={{ rotate: -135 }}
            animate={{ rotate: rotationDegrees }}
            transition={{ type: "spring", stiffness: 50, damping: 15 }}
            style={{ 
              transformOrigin: "50% 50%",
              transformBox: "view-box"
            }}
          >
            <line
              x1="0" y1="0" x2="0" y2={-radius + 15}
              stroke={color}
              strokeWidth="4"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 6px ${color})` }}
            />
            <circle cx="0" cy="0" r="8" fill="#1a1a1a" stroke={color} strokeWidth="1" />
            <circle cx="0" cy="0" r="3" fill={color} />
            <circle cx="0" cy="0" r="1" fill="white" />
          </motion.g>
        </svg>

        {/* Digital Display */}
        <div className="absolute bottom-12 left-0 right-0 flex flex-col items-center z-20">
          <span className="text-2xl font-mono font-bold text-white tracking-tighter">
            {value.toLocaleString()}
          </span>
          <span className="text-[9px] font-mono font-black uppercase tracking-[0.2em] text-steel">
            {unit}
          </span>
        </div>
      </div>
      
      <h4 className="mt-6 text-xs font-display font-black uppercase italic tracking-widest text-steel group-hover:text-primary transition-colors text-center">
        {label}
      </h4>
    </div>
  );
};

export default function Gauges() {
  const { t } = useLanguage();
  const [stats, setStats] = useState({ riders: 0, ecosystems: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchStats = async (retries = 3) => {
      try {
        const res = await fetchWithAuth('/api/stats/counts');
        if (res.ok) {
          const data = await res.json();
          if (mounted) setStats(data);
        } else {
          const errorText = await res.text();
          console.warn(`Stats fetch returned ${res.status}: ${errorText}`);
        }
      } catch (err: any) {
        if (mounted) {
          if (retries === 0) {
            console.error('Failed to fetch stats:', err);
          } else {
            console.log(`Retrying stats fetch... (${retries} left)`);
            setTimeout(() => fetchStats(retries - 1), 2000);
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    // Small delay to ensure server is ready in dev environment
    const timer = setTimeout(() => fetchStats(), 500);
    
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
      <div className="relative group w-full">
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-primary/0 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
        <div className="relative bg-carbon/40 backdrop-blur-sm border border-white/5 p-8 rounded-2xl flex flex-col items-center">
          <Gauge 
            id="riders"
            value={stats.riders} 
            max={Math.max(100, stats.riders * 1.2)} 
            label={t('home.momentum.riders')} 
            unit="RIDERS" 
            color="#ff5500" 
          />
        </div>
      </div>
      
      <div className="relative group w-full">
        <div className="absolute -inset-1 bg-gradient-to-r from-accent/20 to-accent/0 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
        <div className="relative bg-carbon/40 backdrop-blur-sm border border-white/5 p-8 rounded-2xl flex flex-col items-center">
          <Gauge 
            id="ecosystems"
            value={stats.ecosystems} 
            max={Math.max(50, stats.ecosystems * 1.2)} 
            label={t('home.momentum.ecosystems')} 
            unit="PARTNERS" 
            color="#00ffcc" 
          />
        </div>
      </div>
    </div>
  );
}
