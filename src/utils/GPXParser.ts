export interface RoutePoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: string;
}

export interface ParsedRoute {
  route_id: string;
  name: string;
  points: RoutePoint[];
  distance_km: number;
  elevation_gain: number;
  metrics: {
    curvature: number;
    scenic: number;
    stops: number;
    popularity: number;
    elevation: number;
  };
  road_score: number;
  difficulty: string;
  tags: string[];
  polyline: [number, number][];
  start_point: { lat: number; lng: number };
  end_point: { lat: number; lng: number };
  source: string;
}

// Haversine formula to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const parseGPX = async (file: File): Promise<ParsedRoute> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");
        
        const trkptsList = xmlDoc.getElementsByTagName("trkpt");
        const rteptsList = xmlDoc.getElementsByTagName("rtept");
        const coordinatesList = xmlDoc.getElementsByTagName("coordinates");

        const points: RoutePoint[] = [];
        let totalDistance = 0;
        let elevationGain = 0;
        
        if (trkptsList.length > 0) {
          for (let i = 0; i < trkptsList.length; i++) {
            const pt = trkptsList[i];
            const lat = parseFloat(pt.getAttribute("lat") || "0");
            const lng = parseFloat(pt.getAttribute("lon") || "0");
            const eleNode = pt.getElementsByTagName("ele")[0];
            const ele = eleNode ? parseFloat(eleNode.textContent || "0") : undefined;
            const timeNode = pt.getElementsByTagName("time")[0];
            const time = timeNode ? timeNode.textContent || undefined : undefined;
            points.push({ lat, lng, ele, time });
          }
        } else if (rteptsList.length > 0) {
          for (let i = 0; i < rteptsList.length; i++) {
            const pt = rteptsList[i];
            const lat = parseFloat(pt.getAttribute("lat") || "0");
            const lng = parseFloat(pt.getAttribute("lon") || "0");
            const eleNode = pt.getElementsByTagName("ele")[0];
            const ele = eleNode ? parseFloat(eleNode.textContent || "0") : undefined;
            const timeNode = pt.getElementsByTagName("time")[0];
            const time = timeNode ? timeNode.textContent || undefined : undefined;
            points.push({ lat, lng, ele, time });
          }
        } else if (coordinatesList.length > 0) {
          for (let i = 0; i < coordinatesList.length; i++) {
            const coordsText = coordinatesList[i].textContent || "";
            const coordsArray = coordsText.trim().split(/\s+/);
            for (const coord of coordsArray) {
              const parts = coord.split(',');
              if (parts.length >= 2) {
                const lng = parseFloat(parts[0]);
                const lat = parseFloat(parts[1]);
                const ele = parts.length >= 3 ? parseFloat(parts[2]) : undefined;
                if (!isNaN(lat) && !isNaN(lng)) {
                  points.push({ lat, lng, ele });
                }
              }
            }
          }
        }

        if (points.length === 0) {
          throw new Error("No track points found in GPX/KML file");
        }

        for (let i = 1; i < points.length; i++) {
          const prevPt = points[i - 1];
          const currPt = points[i];
          totalDistance += calculateDistance(prevPt.lat, prevPt.lng, currPt.lat, currPt.lng);
          
          if (currPt.ele !== undefined && prevPt.ele !== undefined && currPt.ele > prevPt.ele) {
            elevationGain += (currPt.ele - prevPt.ele);
          }
        }

        const nameNode = xmlDoc.getElementsByTagName("name")[0];
        const routeName = nameNode ? nameNode.textContent || file.name : file.name;

        // Mock Analysis Algorithm (Road Discovery algorithm)
        // In a real app, this would be an API call
        const curvatureScore = Math.min(100, Math.max(40, Math.floor(Math.random() * 60 + 40)));
        const scenicScore = Math.min(100, Math.max(50, Math.floor(Math.random() * 50 + 50)));
        const stopsScore = Math.floor(Math.random() * 100);
        const popularityScore = Math.floor(Math.random() * 100);
        const elevationScore = Math.min(100, Math.floor((elevationGain / 1000) * 100));
        
        const rideScore = Math.floor((curvatureScore * 0.4) + (scenicScore * 0.3) + (elevationScore * 0.3));
        
        let difficulty = 'moderate';
        if (rideScore > 85 || elevationGain > 2000) difficulty = 'expert';
        else if (rideScore < 50) difficulty = 'easy';

        const polyline = points.map(p => [p.lat, p.lng] as [number, number]);

        const parsedRoute: ParsedRoute = {
          route_id: `imported_${Date.now()}`,
          name: routeName.replace('.gpx', ''),
          points,
          distance_km: parseFloat(totalDistance.toFixed(1)),
          elevation_gain: Math.round(elevationGain),
          metrics: {
            curvature: curvatureScore,
            scenic: scenicScore,
            stops: stopsScore,
            popularity: popularityScore,
            elevation: elevationScore
          },
          road_score: rideScore,
          difficulty,
          tags: ['imported', rideScore > 80 ? 'twisty' : 'touring'],
          polyline,
          start_point: { lat: points[0].lat, lng: points[0].lng },
          end_point: { lat: points[points.length - 1].lat, lng: points[points.length - 1].lng },
          source: 'gpx_import'
        };

        resolve(parsedRoute);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
};

export const exportToGPX = (route: ParsedRoute): string => {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  gpx += `<gpx version="1.1" creator="Roads Discovery">\n`;
  gpx += `  <trk>\n`;
  gpx += `    <name>${route.name}</name>\n`;
  gpx += `    <trkseg>\n`;
  
  route.points.forEach(pt => {
    gpx += `      <trkpt lat="${pt.lat}" lon="${pt.lng}">\n`;
    if (pt.ele !== undefined) gpx += `        <ele>${pt.ele}</ele>\n`;
    if (pt.time !== undefined) gpx += `        <time>${pt.time}</time>\n`;
    gpx += `      </trkpt>\n`;
  });
  
  gpx += `    </trkseg>\n`;
  gpx += `  </trk>\n`;
  gpx += `</gpx>`;
  
  return gpx;
};
