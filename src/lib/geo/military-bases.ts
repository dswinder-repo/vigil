/**
 * Major US/NATO military installations and fleet positions.
 * Static GeoJSON data for globe overlay visualization.
 */

export interface MilitaryBase {
  id: string;
  name: string;
  coordinates: [number, number]; // [lng, lat]
  country: string;
  branch: 'navy' | 'airforce' | 'army' | 'marines' | 'joint';
  description: string;
  region: string;
}

export const MILITARY_BASES: MilitaryBase[] = [
  // Middle East / Central Command
  {
    id: 'al-udeid',
    name: 'Al Udeid Air Base',
    coordinates: [51.315, 25.117],
    country: 'Qatar',
    branch: 'airforce',
    description: 'CENTCOM forward HQ. Largest US air base in Middle East.',
    region: 'CENTCOM',
  },
  {
    id: 'bahrain-5th-fleet',
    name: 'NSA Bahrain (5th Fleet)',
    coordinates: [50.608, 26.236],
    country: 'Bahrain',
    branch: 'navy',
    description: 'US 5th Fleet HQ. Naval Forces Central Command.',
    region: 'CENTCOM',
  },
  {
    id: 'camp-lemonnier',
    name: 'Camp Lemonnier',
    coordinates: [43.148, 11.548],
    country: 'Djibouti',
    branch: 'joint',
    description: 'Only permanent US base in Africa. Supports AFRICOM ops.',
    region: 'AFRICOM',
  },
  {
    id: 'incirlik',
    name: 'Incirlik Air Base',
    coordinates: [35.426, 37.002],
    country: 'Turkey',
    branch: 'airforce',
    description: 'NATO base. Strategic for Middle East & Eastern Med ops.',
    region: 'EUCOM',
  },
  {
    id: 'diego-garcia',
    name: 'Diego Garcia',
    coordinates: [72.41, -7.32],
    country: 'BIOT',
    branch: 'joint',
    description: 'Indian Ocean staging base. Bomber & submarine support.',
    region: 'INDOPACOM',
  },
  // Europe
  {
    id: 'ramstein',
    name: 'Ramstein Air Base',
    coordinates: [7.6, 49.437],
    country: 'Germany',
    branch: 'airforce',
    description: 'USAFE HQ. NATO Allied Air Command. Largest US base in Europe.',
    region: 'EUCOM',
  },
  {
    id: 'sigonella',
    name: 'NAS Sigonella',
    coordinates: [14.922, 37.402],
    country: 'Italy',
    branch: 'navy',
    description: 'Mediterranean hub. ISR and logistics for Africa/Med ops.',
    region: 'EUCOM',
  },
  {
    id: 'rota',
    name: 'Naval Station Rota',
    coordinates: [-6.35, 36.62],
    country: 'Spain',
    branch: 'navy',
    description: 'Aegis destroyer forward base. Atlantic/Med gateway.',
    region: 'EUCOM',
  },
  // Indo-Pacific
  {
    id: 'yokosuka',
    name: 'Yokosuka Naval Base',
    coordinates: [139.654, 35.283],
    country: 'Japan',
    branch: 'navy',
    description: 'US 7th Fleet HQ. Largest forward-deployed naval base.',
    region: 'INDOPACOM',
  },
  {
    id: 'kadena',
    name: 'Kadena Air Base',
    coordinates: [127.769, 26.352],
    country: 'Japan (Okinawa)',
    branch: 'airforce',
    description: 'Largest US air base in Pacific. Keystone of Pacific.',
    region: 'INDOPACOM',
  },
  {
    id: 'guam',
    name: 'Andersen AFB / Naval Base Guam',
    coordinates: [144.924, 13.584],
    country: 'Guam',
    branch: 'joint',
    description: 'Strategic bomber base & submarine port. Pacific power projection.',
    region: 'INDOPACOM',
  },
  // US Mainland
  {
    id: 'norfolk',
    name: 'Naval Station Norfolk',
    coordinates: [-76.33, 36.95],
    country: 'USA',
    branch: 'navy',
    description: 'Largest naval base in the world. 2nd Fleet & NATO SACLANT.',
    region: 'CONUS',
  },
  {
    id: 'pearl-harbor',
    name: 'JBPHH Pearl Harbor',
    coordinates: [-157.95, 21.35],
    country: 'USA',
    branch: 'navy',
    description: 'INDOPACOM HQ. Pacific Fleet headquarters.',
    region: 'INDOPACOM',
  },
  {
    id: 'san-diego',
    name: 'Naval Base San Diego',
    coordinates: [-117.12, 32.685],
    country: 'USA',
    branch: 'navy',
    description: 'Largest naval base on US West Coast. 3rd Fleet.',
    region: 'CONUS',
  },
];

/** Branch icons/colors for display */
export const BRANCH_COLORS: Record<MilitaryBase['branch'], string> = {
  navy: '#3B82F6',     // Blue
  airforce: '#60A5FA',  // Light blue
  army: '#22C55E',      // Green
  marines: '#EF4444',   // Red
  joint: '#A855F7',     // Purple
};

/** Build GeoJSON for military base markers */
export function militaryBasesToGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: MILITARY_BASES.map((base) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: base.coordinates,
      },
      properties: {
        id: base.id,
        name: base.name,
        branch: base.branch,
        country: base.country,
        description: base.description,
        region: base.region,
      },
    })),
  };
}
