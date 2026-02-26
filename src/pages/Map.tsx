import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Building2, MapPin } from 'lucide-react';

// Fix for default marker icons in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function MapView() {
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
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] w-full relative">
      <div className="absolute top-4 left-4 z-[1000] bg-zinc-950/90 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-xl max-w-xs">
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-orange-500" />
          Ecosystem Map
        </h2>
        <p className="text-sm text-zinc-400">
          Discover repair shops, dealerships, and biker-friendly spots around you.
        </p>
      </div>

      <MapContainer 
        center={[34.0522, -118.2437]} 
        zoom={11} 
        className="h-full w-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {ecosystems.map((eco) => (
          <Marker key={eco.user_id} position={[eco.lat, eco.lng]}>
            <Popup className="custom-popup">
              <div className="p-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                    <img src={eco.profile_picture_url} alt={eco.company_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 leading-tight">{eco.company_name}</h3>
                    <span className="text-xs text-orange-600 font-medium capitalize">{eco.service_category}</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-600 mb-2 line-clamp-2">{eco.details}</p>
                <a 
                  href={`/profile/${eco.username}`}
                  className="block w-full text-center bg-orange-500 text-white text-xs font-bold py-1.5 rounded hover:bg-orange-600 transition-colors"
                >
                  View Profile
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
