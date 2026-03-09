import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Building2, MapPin, Wrench, ShoppingBag, Coffee, Beer, Users, Route, Flag, Settings, Shield } from 'lucide-react';
import { renderToString } from 'react-dom/server';
import { useLanguage } from '../contexts/LanguageContext';

// Fix for default marker icons in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const categoryConfig: Record<string, { color: string, icon: any, label: string }> = {
  dealership: { color: '#3b82f6', icon: <Building2 className="w-4 h-4 text-white" />, label: 'Dealership' },
  gear_shop: { color: '#10b981', icon: <ShoppingBag className="w-4 h-4 text-white" />, label: 'Gear Shop' },
  parts_store: { color: '#eab308', icon: <Settings className="w-4 h-4 text-white" />, label: 'Parts Store' },
  workshop: { color: '#f97316', icon: <Wrench className="w-4 h-4 text-white" />, label: 'Workshop' },
  meeting_spot: { color: '#8b5cf6', icon: <Users className="w-4 h-4 text-white" />, label: 'Meeting Spot' },
  ride_spot: { color: '#ec4899', icon: <MapPin className="w-4 h-4 text-white" />, label: 'Ride Spot' },
  biker_cafe: { color: '#a8a29e', icon: <Coffee className="w-4 h-4 text-white" />, label: 'Biker Cafe' },
  biker_bar: { color: '#ef4444', icon: <Beer className="w-4 h-4 text-white" />, label: 'Biker Bar' },
  ride_stop: { color: '#14b8a6', icon: <Flag className="w-4 h-4 text-white" />, label: 'Ride Stop' },
  motoclub: { color: '#52525b', icon: <Shield className="w-4 h-4 text-white" />, label: 'Moto Club' },
  ride_route: { color: '#06b6d4', icon: <Route className="w-4 h-4 text-white" />, label: 'Ride Route' },
};

const createCustomIcon = (category: string) => {
  const config = categoryConfig[category] || { color: '#f97316', icon: <MapPin className="w-4 h-4 text-white" /> };
  const iconHtml = renderToString(
    <div style={{ backgroundColor: config.color }} className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
      {config.icon}
    </div>
  );

  return L.divIcon({
    html: iconHtml,
    className: 'custom-leaflet-icon bg-transparent border-none',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

const mapData = [
{"name":"Moto City","category":"dealership","lat":-19.8882,"lng":-44.0121,"city":"Belo Horizonte"},
{"name":"Valence Yamaha Barão","category":"dealership","lat":-19.9760,"lng":-43.9654,"city":"Belo Horizonte"},
{"name":"Valence Yamaha Pedro II","category":"dealership","lat":-19.9047,"lng":-43.9556,"city":"Belo Horizonte"},
{"name":"Valence Kawasaki","category":"dealership","lat":-19.9755,"lng":-43.9639,"city":"Belo Horizonte"},
{"name":"Royal Enfield BHZ","category":"dealership","lat":-19.9769,"lng":-43.9635,"city":"Belo Horizonte"},
{"name":"Ducati Belo Horizonte","category":"dealership","lat":-19.9778,"lng":-43.9648,"city":"Belo Horizonte"},
{"name":"BMW Motorrad BH","category":"dealership","lat":-19.9598,"lng":-43.9394,"city":"Belo Horizonte"},
{"name":"Triumph BH","category":"dealership","lat":-19.9475,"lng":-43.9512,"city":"Belo Horizonte"},
{"name":"Harley-Davidson BH","category":"dealership","lat":-19.9751,"lng":-43.9659,"city":"Belo Horizonte"},
{"name":"Honda By Moto Amazonas","category":"dealership","lat":-19.9362,"lng":-43.9618,"city":"Belo Horizonte"},
{"name":"Honda By Moto Centro","category":"dealership","lat":-19.9199,"lng":-43.9370,"city":"Belo Horizonte"},
{"name":"Moto Roma Yamaha","category":"dealership","lat":-19.9220,"lng":-43.9403,"city":"Belo Horizonte"},
{"name":"Banzai Honda Pampulha","category":"dealership","lat":-19.8621,"lng":-43.9651,"city":"Belo Horizonte"},
{"name":"Minas Motos","category":"dealership","lat":-19.9191,"lng":-43.9355,"city":"Belo Horizonte"},
{"name":"Moto Street Raja","category":"gear_shop","lat":-19.9564,"lng":-43.9609,"city":"Belo Horizonte"},
{"name":"Motofort Racing","category":"gear_shop","lat":-19.9068,"lng":-43.9644,"city":"Belo Horizonte"},
{"name":"RC1 Motos","category":"gear_shop","lat":-19.9360,"lng":-43.9376,"city":"Belo Horizonte"},
{"name":"RioSul Motos","category":"parts_store","lat":-19.9188,"lng":-43.9373,"city":"Belo Horizonte"},
{"name":"Moto Alfa Centro","category":"parts_store","lat":-19.9189,"lng":-43.9368,"city":"Belo Horizonte"},
{"name":"WDA Motos","category":"parts_store","lat":-19.9190,"lng":-43.9365,"city":"Belo Horizonte"},
{"name":"BH Motoracing","category":"workshop","lat":-19.9757,"lng":-43.9738,"city":"Belo Horizonte"},
{"name":"Oficina Duas Rodas BH","category":"workshop","lat":-19.9342,"lng":-43.9411,"city":"Belo Horizonte"},
{"name":"Garage Moto Service","category":"workshop","lat":-19.9281,"lng":-43.9487,"city":"Belo Horizonte"},
{"name":"Oficina Moto Prime","category":"workshop","lat":-19.9004,"lng":-43.9600,"city":"Belo Horizonte"},
{"name":"Moto Fix BH","category":"workshop","lat":-19.9194,"lng":-43.9482,"city":"Belo Horizonte"},
{"name":"Moto Garage 82","category":"workshop","lat":-19.9488,"lng":-43.9453,"city":"Belo Horizonte"},
{"name":"Savassi Moto Point","category":"meeting_spot","lat":-19.9366,"lng":-43.9380,"city":"Belo Horizonte"},
{"name":"Praça da Liberdade Biker Point","category":"meeting_spot","lat":-19.9321,"lng":-43.9378,"city":"Belo Horizonte"},
{"name":"Mineirão Parking Biker Meet","category":"meeting_spot","lat":-19.8659,"lng":-43.9711,"city":"Belo Horizonte"},
{"name":"Lagoa da Pampulha Ride Spot","category":"ride_spot","lat":-19.8587,"lng":-43.9722,"city":"Belo Horizonte"},
{"name":"Serra do Curral Viewpoint","category":"ride_spot","lat":-19.9563,"lng":-43.9134,"city":"Belo Horizonte"},
{"name":"Praça do Papa","category":"ride_spot","lat":-19.9639,"lng":-43.9131,"city":"Belo Horizonte"},
{"name":"Mirante Mangabeiras","category":"ride_spot","lat":-19.9624,"lng":-43.9155,"city":"Belo Horizonte"},
{"name":"BH Riders Café","category":"biker_cafe","lat":-19.9440,"lng":-43.9398,"city":"Belo Horizonte"},
{"name":"Moto Rock Bar","category":"biker_bar","lat":-19.9368,"lng":-43.9405,"city":"Belo Horizonte"},
{"name":"Route 66 BH Bar","category":"biker_bar","lat":-19.9352,"lng":-43.9389,"city":"Belo Horizonte"},
{"name":"BR040 Biker Stop","category":"ride_stop","lat":-19.9150,"lng":-44.0300,"city":"Belo Horizonte"},
{"name":"MG030 Scenic Stop","category":"ride_stop","lat":-19.9700,"lng":-43.8500,"city":"Nova Lima"},
{"name":"Serra da Moeda Lookout","category":"ride_spot","lat":-20.0500,"lng":-43.9800,"city":"Brumadinho"},
{"name":"Top of the Mountain Route","category":"ride_spot","lat":-20.0600,"lng":-43.9700,"city":"Brumadinho"},
{"name":"Casa Branca Biker Stop","category":"ride_stop","lat":-20.0830,"lng":-43.9950,"city":"Brumadinho"},
{"name":"Macacos Village Biker Stop","category":"ride_stop","lat":-19.9660,"lng":-43.8500,"city":"Nova Lima"},
{"name":"Alphaville Lagoa Stop","category":"ride_stop","lat":-19.8800,"lng":-43.8500,"city":"Nova Lima"},
{"name":"Nova Lima Downtown Biker Spot","category":"meeting_spot","lat":-19.9830,"lng":-43.8460,"city":"Nova Lima"},
{"name":"BH Moto Clube HQ","category":"motoclub","lat":-19.9300,"lng":-43.9600,"city":"Belo Horizonte"},
{"name":"Iron Riders MC","category":"motoclub","lat":-19.9000,"lng":-43.9500,"city":"Belo Horizonte"},
{"name":"Estrada Real Rider Stop","category":"ride_stop","lat":-20.0200,"lng":-43.8500,"city":"Minas Gerais"},
{"name":"BR356 Scenic Ride","category":"ride_route","lat":-19.9400,"lng":-43.8700,"city":"Minas Gerais"},
{"name":"Serra do Rola Moça Gate","category":"ride_spot","lat":-20.0300,"lng":-43.9900,"city":"Brumadinho"},
{"name":"BH Moto Market","category":"gear_shop","lat":-19.9200,"lng":-43.9600,"city":"Belo Horizonte"},
{"name":"Two Wheels Garage","category":"workshop","lat":-19.9300,"lng":-43.9500,"city":"Belo Horizonte"},
{"name":"Moto Tech Service","category":"workshop","lat":-19.9250,"lng":-43.9450,"city":"Belo Horizonte"},
{"name":"Moto Riders Hub","category":"meeting_spot","lat":-19.9350,"lng":-43.9400,"city":"Belo Horizonte"},
{"name":"Savassi Riders Point","category":"meeting_spot","lat":-19.9365,"lng":-43.9388,"city":"Belo Horizonte"},
{"name":"BH Night Riders Square","category":"meeting_spot","lat":-19.9370,"lng":-43.9390,"city":"Belo Horizonte"}
];

export default function MapView() {
  const { t } = useLanguage();
  const [ecosystems, setEcosystems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEcosystems = async () => {
      try {
        const res = await fetch('/api/ecosystems');
        const data = await res.json();
        setEcosystems(data.filter((e: any) => e.lat && e.lng));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchEcosystems();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] w-full relative">
      <div className="absolute top-8 left-8 z-[1000] glass-card p-6 shadow-2xl shadow-primary/10 max-w-xs border-primary/20">
        <h2 className="text-2xl font-display font-black uppercase italic tracking-tighter mb-3 flex items-center gap-3 text-primary">
          <MapPin className="w-6 h-6" />
          {t('map.title')}
        </h2>
        <p className="text-xs font-light text-zinc-400 leading-relaxed">
          {t('map.subtitle')}
        </p>
      </div>

      <MapContainer 
        center={[-19.9167, -43.9345]} 
        zoom={12} 
        className="h-full w-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {ecosystems.map((eco) => (
          <Marker key={eco.user_id} position={[eco.lat, eco.lng]} icon={createCustomIcon(eco.service_category)}>
            <Popup className="custom-popup">
              <div className="p-2 min-w-[200px]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-zinc-200">
                    <img src={eco.profile_picture_url} alt={eco.company_name} className="w-full h-full object-cover grayscale" referrerPolicy="no-referrer" />
                  </div>
                  <div>
                    <h3 className="font-display font-black uppercase italic text-zinc-950 leading-none tracking-tight mb-1">{eco.company_name}</h3>
                    <span className="text-[10px] font-mono font-black text-primary uppercase tracking-widest">{t(`category.${eco.service_category}`) || eco.service_category}</span>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-600 mb-4 line-clamp-2 leading-relaxed font-light">{eco.details}</p>
                <a 
                  href={`/profile/${eco.username}`}
                  className="block w-full text-center bg-zinc-950 text-white text-[10px] font-mono font-bold uppercase tracking-widest py-2.5 rounded-xl hover:bg-primary hover:text-zinc-950 transition-all shadow-lg"
                >
                  {t('map.viewProfile')}
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
        {mapData.map((item, index) => (
          <Marker key={`static-${index}`} position={[item.lat, item.lng]} icon={createCustomIcon(item.category)}>
            <Popup className="custom-popup">
              <div className="p-2 min-w-[200px]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-zinc-200 flex items-center justify-center" style={{ backgroundColor: categoryConfig[item.category]?.color || '#f97316' }}>
                    {categoryConfig[item.category]?.icon || <MapPin className="w-5 h-5 text-white" />}
                  </div>
                  <div>
                    <h3 className="font-display font-black uppercase italic text-zinc-950 leading-none tracking-tight mb-1">{item.name}</h3>
                    <span className="text-[10px] font-mono font-black text-primary uppercase tracking-widest">{t(`category.${item.category}`) || item.category.replace('_', ' ')}</span>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-600 mb-4 line-clamp-2 leading-relaxed font-light">{item.city}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-8 right-8 z-[1000] glass-card p-4 shadow-2xl shadow-primary/10 max-w-xs border-primary/20 max-h-[60vh] overflow-y-auto">
        <h3 className="text-sm font-display font-black uppercase italic tracking-tighter mb-3 text-white">{t('map.legend')}</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {Object.entries(categoryConfig).map(([key, config]) => (
            <div key={key} className="flex items-center gap-2">
              <div 
                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: config.color }}
              >
                {React.cloneElement(config.icon as React.ReactElement, { className: 'w-3 h-3 text-white' })}
              </div>
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider truncate">{t(`category.${key}`) || config.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

