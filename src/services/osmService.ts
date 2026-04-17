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
  // Cap radius at 15km to prevent Overpass Gateway Timeouts
  const effectiveRadius = Math.min(radius, 15000);
  
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)},${effectiveRadius}`;
  const cached = OSM_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // We use a regex filter (~"moto|biker|rider|custom|chopper") on generic categories 
  // to prevent fetching thousands of irrelevant cafes/parks and timing out the API.
  // Dedicated motorcycle shops/repair are fetched unconditionally.
  const query = `
    [out:json][timeout:25];
    (
      node["shop"~"motorcycle|motorcycle_repair|motorcycle_parts"](around:${effectiveRadius},${lat},${lng});
      way["shop"~"motorcycle|motorcycle_repair|motorcycle_parts"](around:${effectiveRadius},${lat},${lng});

      node["craft"="mechanic"](around:${effectiveRadius},${lat},${lng});
      node["shop"="repair"](around:${effectiveRadius},${lat},${lng});

      node["shop"~"clothes|outdoor|sports"]["name"~"moto|biker|rider|custom|chopper",i](around:${effectiveRadius},${lat},${lng});

      node["amenity"~"cafe|bar|restaurant|fast_food"]["name"~"moto|biker|rider|custom|chopper",i](around:${effectiveRadius},${lat},${lng});

      node["amenity"="fuel"](around:${effectiveRadius},${lat},${lng});
      node["highway"="rest_area"](around:${effectiveRadius},${lat},${lng});

      node["leisure"~"park"]["name"~"moto|biker|rider|custom|chopper",i](around:${effectiveRadius},${lat},${lng});
      node["tourism"~"viewpoint"](around:${effectiveRadius},${lat},${lng});
      node["amenity"="parking"]["name"~"moto|biker|rider|custom|chopper",i](around:${effectiveRadius},${lat},${lng});

      node["shop"="hairdresser"]["name"~"moto|biker|rider|custom|chopper",i](around:${effectiveRadius},${lat},${lng});

      node["club"]["name"~"moto|biker|rider|custom|chopper",i](around:${effectiveRadius},${lat},${lng});
      node["amenity"="social_centre"]["name"~"moto|biker|rider|custom|chopper",i](around:${effectiveRadius},${lat},${lng});
    );
    out center;
  `;

  const url = `https://overpass-api.de/api/interpreter`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s fetch timeout

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal
    });
  } catch (e: any) {
    if (e.name === 'AbortError') {
      throw new Error('OSM fetch timed out after 30 seconds');
    }
    console.error("OSM fetch failed, retrying...", e);
    // Retry once with a shorter timeout
    const retryController = new AbortController();
    const retryTimeoutId = setTimeout(() => retryController.abort(), 20000);
    try {
      response = await fetch(url, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: retryController.signal
      });
    } finally {
      clearTimeout(retryTimeoutId);
    }
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.statusText}`);
  }

  const data = await response.json() as any;
  const places: OSMPlace[] = [];
  const seen = new Set<string>();

  for (const element of data.elements) {
    if (!element.tags || !element.tags.name) continue;

    const name = element.tags.name;
    // For 'way' elements, Overpass with 'out center' provides center lat/lon
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
      rating: 4.0, // Default mock rating for OSM
      reviews: 0
    });
  }

  OSM_CACHE.set(cacheKey, { timestamp: Date.now(), data: places });
  return places;
}
