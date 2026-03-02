export type EventSource = 'gdelt' | 'usgs' | 'eonet' | 'reliefweb' | 'nws' | 'who' | 'gdacs' | 'acled' | 'cisa' | 'firms' | 'space-weather' | 'meteoalarm' | 'faa-tfr';

export type EventCategory = 'conflict' | 'disaster' | 'disease' | 'political' | 'cyber' | 'unrest' | 'humanitarian';

export type Severity = 1 | 2 | 3 | 4 | 5;

export interface NormalizedEvent {
  id: string;
  source: EventSource;
  category: EventCategory;
  severity: Severity;
  title: string;
  summary: string;
  coordinates: [number, number]; // [lng, lat]
  timestamp: string;
  url?: string;
  metadata: Record<string, unknown>;
}

export interface CategoryFilter {
  category: EventCategory;
  enabled: boolean;
  color: string;
  label: string;
}

export interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  changePercent: number;
  source: 'coingecko' | 'finnhub' | 'yahoo';
}

export interface PredictionMarket {
  id: string;
  question: string;
  probability: number;
  volume24h: number;
  url: string;
  source: 'manifold' | 'polymarket';
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  timestamp: string;
}

export interface OSINTPost {
  id: string;
  account: string;
  text: string;
  timestamp: string;
  url: string;
}

export interface CameraFeed {
  id: string;
  title: string;
  location: string;
  imageUrl: string;
  sourceUrl?: string;
  type: 'satellite' | 'webcam' | 'traffic';
}

export interface MilitaryEvent {
  id: string;
  title: string;
  summary: string;
  coordinates: [number, number];
  timestamp: string;
  url: string;
  type: 'deployment' | 'movement' | 'exercise' | 'strike' | 'naval' | 'air' | 'general';
  region: string;
}
