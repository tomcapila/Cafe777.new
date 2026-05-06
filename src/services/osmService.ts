export interface OSMPlace {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  city: string;
  details: string;
  full_address: string;
  isExternal: boolean;
  rating: number;
  reviews: number;
}

const OSM_CACHE = new Map<string, { timestamp: number; data: OSMPlace[] }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function mapCategory(tags: any): string {
  const shop = tags.shop || '';
  const amenity = tags.amenity || '';
  const craft = tags.craft || '';
  const leisure = tags.leisure || '';
  const tourism = tags.tourism || '';
  const highway = tags.highway || '';

  if (shop.includes('motorcycle') || shop === 'motorcycle_parts') return 'parts_store';
  if (shop === 'motorcycle_repair' || craft === 'mechanic' || shop === 'repair') return 'repair';
  if (amenity === 'cafe') return 'biker_cafe';
  if (amenity === 'bar') return 'biker_bar';
  if (amenity === 'restaurant' || amenity === 'fast_food') return 'biker_cafe'; // Map to cafe for now
  if (amenity === 'fuel' || highway === 'rest_area') return 'ride_stop';
  if (leisure === 'park' || tourism === 'viewpoint' || amenity === 'parking') return 'meeting_spot';
  if (tags.club || amenity === 'social_centre') return 'motoclub';
  if (shop.match(/clothes|outdoor|sports|hairdresser/)) return 'gear_shop'; // Map to gear shop

  return 'meeting_spot'; // Default fallback
}

function buildAddress(tags: any): string {
  const parts = [];
  if (tags['addr:street']) {
    let street = tags['addr:street'];
    if (tags['addr:housenumber']) street += ' ' + tags['addr:housenumber'];
    parts.push(street);
  }
  if (tags['addr:city']) parts.push(tags['addr:city']);
  if (tags['addr:state']) parts.push(tags['addr:state']);
  return parts.join(', ') || 'Address not available';
}

export async function fetchOSMPlaces(lat: number, lng: number, radius: number = 10000): Promise<OSMPlace[]> {
  // Cap radius at 5km to prevent Overpass Gateway Timeouts in dense areas
  // Public Overpass instances struggle with large radiuses combined with regex filters.
  const effectiveRadius = Math.min(radius, 5000);
  
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)},${effectiveRadius}`;
  const cached = OSM_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Overpass QL is extremely slow when doing regex (~"moto") across large datasets
  // like cafes or restaurants. Since Google Places already handles keyword search,
  // we'll restrict OSM to strictly tagged POIs to guarantee lightning-fast O(1) index lookups.
  const query = `
    [out:json][timeout:25];
    (
      node["shop"~"motorcycle|motorcycle_repair|motorcycle_parts"](around:${effectiveRadius},${lat},${lng});
      way["shop"~"motorcycle|motorcycle_repair|motorcycle_parts"](around:${effectiveRadius},${lat},${lng});
      
      node["amenity"="motorcycle_parking"](around:${effectiveRadius},${lat},${lng});
      node["amenity"="motorcycle_rental"](around:${effectiveRadius},${lat},${lng});
      node["motorcycle"="yes"](around:${effectiveRadius},${lat},${lng});
      
      node["amenity"="fuel"](around:${effectiveRadius},${lat},${lng});
      node["highway"="rest_area"](around:${effectiveRadius},${lat},${lng});
      node["tourism"="viewpoint"](around:${effectiveRadius},${lat},${lng});
    );
    out center;
  `;

  const instances = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  let lastError: Error | null = null;

  for (const url of instances) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s client timeout

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'Cafe777 Ride Discovery App (th@cafe777.com)'
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Instance ${url} status ${response.status}`);
      }

      const text = await response.text();
      if (!text || text.trim() === "") {
        clearTimeout(timeoutId);
        return [];
      }

      const data = JSON.parse(text);
      const elements = data.elements || [];
      const places: OSMPlace[] = [];
      const seen = new Set<string>();

      for (const element of elements) {
        if (!element.tags || !element.tags.name) continue;

        const name = element.tags.name;
        const elLat = element.lat || element.center?.lat;
        const elLng = element.lon || element.center?.lon;
        
        if (!elLat || !elLng) continue;

        const dedupKey = `${name.toLowerCase()}_${elLat.toFixed(4)}_${elLng.toFixed(4)}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        places.push({
          id: `osm_${element.id}`,
          name: name,
          category: mapCategory(element.tags),
          lat: elLat,
          lng: elLng,
          city: element.tags['addr:city'] || 'Unknown City',
          details: element.tags.description || element.tags.website || element.tags.phone || 'No details available',
          full_address: buildAddress(element.tags),
          isExternal: true,
          rating: 4.0,
          reviews: 0
        });
      }

      OSM_CACHE.set(cacheKey, { timestamp: Date.now(), data: places });
      clearTimeout(timeoutId);
      return places;

    } catch (e: any) {
      clearTimeout(timeoutId);
      lastError = e;
      console.warn(`OSM fetch failed on ${url}:`, e.message);
      continue; // Try next instance
    }
  }

  throw lastError || new Error("All Overpass instances failed");
}
