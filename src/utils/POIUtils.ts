
/**
 * Utility functions for Points of Interest (POI) detection and filtering
 */

export interface POI {
  id?: string | number;
  name: string;
  category: string;
  lat: number;
  lng: number;
  description?: string;
  rating?: number;
  source: 'internal' | 'ecosystem' | 'external';
  distanceFromRoute?: number; // in km
  profileUrl?: string;
}

/**
 * Calculates the distance between two points in kilometers using the Haversine formula
 */
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Finds the minimum distance from a point to a polyline
 */
export function getMinDistanceToPolyline(point: { lat: number, lng: number }, polyline: [number, number][]): number {
  let minDistance = Infinity;
  for (let i = 0; i < polyline.length; i++) {
    const dist = getDistance(point.lat, point.lng, polyline[i][0], polyline[i][1]);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }
  return minDistance;
}

/**
 * Fetches POIs from OpenStreetMap using Overpass API
 */
export async function fetchExternalPOIs(polyline: [number, number][], radiusKm: number = 5): Promise<POI[]> {
  // To keep it performant, we'll sample the polyline if it's too long
  const sampledPoints = polyline.filter((_, index) => index % 10 === 0 || index === polyline.length - 1);
  
  // Construct the around string for Overpass
  // Format: (around:radius,lat1,lon1,lat2,lon2,...)
  const radiusMeters = radiusKm * 1000;
  
  // Overpass API can be slow if we send too many points. 
  // We'll use a bounding box first to narrow down, then filter locally.
  const lats = polyline.map(p => p[0]);
  const lngs = polyline.map(p => p[1]);
  const minLat = Math.min(...lats) - 0.05;
  const maxLat = Math.max(...lats) + 0.05;
  const minLng = Math.min(...lngs) - 0.05;
  const maxLng = Math.max(...lngs) + 0.05;

  const query = `
    [out:json][timeout:25];
    (
      node["amenity"~"cafe|restaurant|fuel|parking|pub"](${minLat},${minLng},${maxLat},${maxLng});
      node["tourism"~"viewpoint|hotel|information"](${minLat},${minLng},${maxLat},${maxLng});
      node["highway"~"mountain_pass"](${minLat},${minLng},${maxLat},${maxLng});
      node["shop"~"motorcycle"](${minLat},${minLng},${maxLat},${maxLng});
    );
    out body;
  `;

  try {
    const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    const data = await response.json();
    
    return data.elements
      .filter((el: any) => el.tags && (el.tags.name || el.tags.operator))
      .map((el: any) => ({
        id: el.id,
        name: el.tags.name || el.tags.operator,
        category: el.tags.amenity || el.tags.tourism || el.tags.highway || el.tags.shop || 'other',
        lat: el.lat,
        lng: el.lon,
        source: 'external',
        description: el.tags.description || el.tags.note
      }));
  } catch (error) {
    console.error("Error fetching external POIs:", error);
    return [];
  }
}

/**
 * Maps OSM categories to internal categories
 */
export function mapCategory(category: string): string {
  const mapping: Record<string, string> = {
    'cafe': 'biker_cafe',
    'restaurant': 'restaurant',
    'fuel': 'gas_station',
    'parking': 'parking',
    'pub': 'biker_bar',
    'viewpoint': 'viewpoint',
    'mountain_pass': 'mountain_pass',
    'motorcycle': 'workshop',
    'hotel': 'rest_stop',
    'information': 'info'
  };
  return mapping[category] || 'other';
}
