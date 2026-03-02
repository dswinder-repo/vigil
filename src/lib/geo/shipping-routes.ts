/**
 * Major global shipping routes and strategic chokepoints.
 * Static GeoJSON data for globe overlay visualization.
 */

export interface Chokepoint {
  id: string;
  name: string;
  coordinates: [number, number]; // [lng, lat]
  description: string;
  dailyShips: number; // approximate daily vessel transits
  oilFlow: string; // approximate daily oil flow
}

export const CHOKEPOINTS: Chokepoint[] = [
  {
    id: 'hormuz',
    name: 'Strait of Hormuz',
    coordinates: [56.27, 26.56],
    description: 'Connects Persian Gulf to Gulf of Oman. ~21% of global oil transit.',
    dailyShips: 80,
    oilFlow: '~21M bbl/day',
  },
  {
    id: 'suez',
    name: 'Suez Canal',
    coordinates: [32.34, 30.46],
    description: 'Connects Mediterranean to Red Sea. ~12% of global trade.',
    dailyShips: 55,
    oilFlow: '~5.5M bbl/day',
  },
  {
    id: 'bab-el-mandeb',
    name: 'Bab el-Mandeb',
    coordinates: [43.33, 12.58],
    description: 'Connects Red Sea to Gulf of Aden. Gateway to Suez Canal.',
    dailyShips: 50,
    oilFlow: '~6.2M bbl/day',
  },
  {
    id: 'malacca',
    name: 'Strait of Malacca',
    coordinates: [101.5, 2.5],
    description: 'Between Malay Peninsula and Sumatra. ~25% of global trade.',
    dailyShips: 90,
    oilFlow: '~16M bbl/day',
  },
  {
    id: 'panama',
    name: 'Panama Canal',
    coordinates: [-79.92, 9.08],
    description: 'Connects Atlantic to Pacific. ~5% of global trade.',
    dailyShips: 40,
    oilFlow: '~0.9M bbl/day',
  },
  {
    id: 'turkish-straits',
    name: 'Turkish Straits',
    coordinates: [29.06, 41.12],
    description: 'Bosphorus & Dardanelles. Black Sea access. ~3M bbl/day oil.',
    dailyShips: 45,
    oilFlow: '~3M bbl/day',
  },
  {
    id: 'dover',
    name: 'Strait of Dover',
    coordinates: [1.55, 51.0],
    description: 'English Channel narrowing. One of busiest shipping lanes globally.',
    dailyShips: 400,
    oilFlow: 'N/A',
  },
  {
    id: 'good-hope',
    name: 'Cape of Good Hope',
    coordinates: [18.49, -34.36],
    description: 'Southern tip of Africa. Alternative to Suez when Red Sea is disrupted.',
    dailyShips: 30,
    oilFlow: '~5.9M bbl/day',
  },
  {
    id: 'lombok',
    name: 'Lombok Strait',
    coordinates: [115.7, -8.5],
    description: 'Between Bali and Lombok. Alternative to Malacca for deep-draft vessels.',
    dailyShips: 25,
    oilFlow: '~1.5M bbl/day',
  },
  {
    id: 'gibraltar',
    name: 'Strait of Gibraltar',
    coordinates: [-5.6, 35.96],
    description: 'Mediterranean gateway. Connects Atlantic to Mediterranean.',
    dailyShips: 120,
    oilFlow: '~3M bbl/day',
  },
];

/**
 * Major shipping lane routes as GeoJSON LineString coordinates.
 * Simplified waypoints for each major trade route.
 */
export const SHIPPING_ROUTES: Array<{
  id: string;
  name: string;
  coordinates: [number, number][];
  type: 'oil' | 'container' | 'bulk';
}> = [
  // Asia-Europe via Suez
  {
    id: 'asia-europe-suez',
    name: 'Asia → Europe (Suez)',
    type: 'container',
    coordinates: [
      [104.0, 1.3],     // Singapore
      [98.0, 5.0],      // Malacca entry
      [80.0, 7.0],      // Sri Lanka
      [65.0, 12.0],     // Arabian Sea
      [48.0, 12.5],     // Gulf of Aden
      [43.3, 12.6],     // Bab el-Mandeb
      [38.0, 18.0],     // Red Sea mid
      [32.5, 30.0],     // Suez Canal
      [30.0, 33.0],     // Eastern Med
      [15.0, 36.0],     // Central Med
      [-5.5, 36.0],     // Gibraltar
      [-10.0, 40.0],    // Portugal
      [-5.0, 48.0],     // Bay of Biscay
      [1.5, 51.0],      // Dover
      [4.0, 52.0],      // Rotterdam
    ],
  },
  // Persian Gulf Oil Route
  {
    id: 'persian-gulf-east',
    name: 'Persian Gulf → East Asia',
    type: 'oil',
    coordinates: [
      [50.0, 26.5],     // Persian Gulf
      [56.3, 26.5],     // Hormuz
      [60.0, 24.0],     // Gulf of Oman
      [65.0, 18.0],     // Arabian Sea
      [73.0, 10.0],     // Indian Ocean
      [80.0, 5.0],      // Sri Lanka south
      [95.0, 3.0],      // Malacca approach
      [103.8, 1.3],     // Singapore
      [110.0, 5.0],     // South China Sea
      [117.0, 15.0],    // SCS mid
      [121.5, 25.0],    // Taiwan Strait
      [130.0, 33.0],    // East China Sea
      [137.0, 35.0],    // Japan
    ],
  },
  // Transatlantic
  {
    id: 'transatlantic-north',
    name: 'North Atlantic',
    type: 'container',
    coordinates: [
      [-74.0, 40.7],    // New York
      [-65.0, 42.0],    // Nova Scotia
      [-40.0, 47.0],    // Mid Atlantic
      [-15.0, 50.0],    // Ireland approach
      [-5.0, 48.0],     // English Channel
      [1.5, 51.0],      // Dover
      [4.0, 52.0],      // Rotterdam
    ],
  },
  // Transpacific
  {
    id: 'transpacific',
    name: 'Transpacific',
    type: 'container',
    coordinates: [
      [121.5, 31.2],    // Shanghai
      [125.0, 34.0],    // Korea Strait
      [145.0, 38.0],    // North Pacific
      [170.0, 42.0],    // Mid Pacific
      [-160.0, 40.0],   // East Pacific
      [-140.0, 36.0],   // Approaching CA
      [-122.4, 37.8],   // San Francisco
      [-118.2, 33.9],   // Los Angeles
    ],
  },
  // Cape of Good Hope route (alternative to Suez)
  {
    id: 'cape-route',
    name: 'Cape of Good Hope Route',
    type: 'oil',
    coordinates: [
      [56.3, 26.5],     // Hormuz
      [60.0, 22.0],     // Oman
      [58.0, 12.0],     // Arabian Sea south
      [50.0, 0.0],      // East Africa
      [40.0, -10.0],    // Mozambique Channel
      [30.0, -25.0],    // South Africa east
      [18.5, -34.4],    // Cape of Good Hope
      [5.0, -30.0],     // South Atlantic
      [-10.0, -15.0],   // Mid Atlantic south
      [-25.0, 0.0],     // Equator
      [-40.0, 20.0],    // North Atlantic
      [-15.0, 40.0],    // Portugal approach
      [-5.5, 36.0],     // Gibraltar
    ],
  },
  // South China Sea critical
  {
    id: 'south-china-sea',
    name: 'South China Sea',
    type: 'container',
    coordinates: [
      [103.8, 1.3],     // Singapore
      [106.0, 5.0],     // SCS south
      [112.0, 10.0],    // Spratly region
      [114.0, 14.0],    // Paracel region
      [117.0, 22.0],    // Hong Kong
      [121.5, 25.0],    // Taiwan
      [121.5, 31.2],    // Shanghai
    ],
  },
];

/** Build GeoJSON FeatureCollection for shipping route lines */
export function shippingRoutesToGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: SHIPPING_ROUTES.map((route) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: route.coordinates,
      },
      properties: {
        id: route.id,
        name: route.name,
        type: route.type,
      },
    })),
  };
}

/** Build GeoJSON FeatureCollection for chokepoint markers */
export function chokepointsToGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: CHOKEPOINTS.map((cp) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: cp.coordinates,
      },
      properties: {
        id: cp.id,
        name: cp.name,
        description: cp.description,
        dailyShips: cp.dailyShips,
        oilFlow: cp.oilFlow,
      },
    })),
  };
}
