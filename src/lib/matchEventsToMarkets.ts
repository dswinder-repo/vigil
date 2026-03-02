import type { NormalizedEvent, EventCategory } from '@/lib/types';

export interface MarketMatch {
  id: string;
  question: string;
  url?: string;
  probability?: number; // 0-1
  source: 'polymarket' | 'manifold';
  score: number;
}

// Stop words stripped before keyword extraction
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'in', 'of', 'and', 'or', 'for', 'to', 'at', 'by',
  'on', 'with', 'this', 'that', 'was', 'are', 'be', 'has', 'had', 'have',
  'it', 'its', 'as', 'from', 'but', 'not', 'will', 'would', 'could',
]);

// Category → synonym keywords that earn the category bonus
const CATEGORY_SYNONYMS: Record<EventCategory, string[]> = {
  conflict:      ['war', 'military', 'conflict', 'attack', 'troops', 'combat', 'battle', 'invasion', 'strike'],
  cyber:         ['hack', 'cyber', 'breach', 'ransomware', 'malware', 'vulnerability', 'exploit', 'attack'],
  disease:       ['outbreak', 'epidemic', 'disease', 'virus', 'pandemic', 'infection', 'health', 'who'],
  disaster:      ['earthquake', 'hurricane', 'flood', 'disaster', 'wildfire', 'tornado', 'tsunami', 'storm'],
  political:     ['election', 'sanctions', 'president', 'vote', 'government', 'political', 'congress', 'senate'],
  unrest:        ['protest', 'riot', 'unrest', 'demonstration', 'uprising', 'civil', 'coup'],
  humanitarian:  ['refugee', 'humanitarian', 'aid', 'famine', 'displacement', 'crisis', 'relief'],
};

/** Split text into lowercase tokens, removing punctuation and stop words */
function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  );
}

/** Combine all searchable text from a NormalizedEvent into one string */
function eventSearchText(event: NormalizedEvent): string {
  const parts: string[] = [event.title, event.summary, event.category];
  // Pull country/region out of metadata if present
  const meta = event.metadata;
  if (typeof meta['country'] === 'string') parts.push(meta['country']);
  if (typeof meta['region'] === 'string') parts.push(meta['region']);
  if (typeof meta['location'] === 'string') parts.push(meta['location']);
  return parts.join(' ');
}

/** Score a market question against an event */
function scoreMarket(
  marketQuestion: string,
  eventKeywords: Set<string>,
  countryName: string,
  category: EventCategory,
): number {
  const haystack = marketQuestion.toLowerCase();

  // Base score: count keyword hits
  let score = 0;
  for (const kw of eventKeywords) {
    if (haystack.includes(kw)) score += 1;
  }

  // Country bonus
  if (countryName && haystack.includes(countryName.toLowerCase())) {
    score += 2;
  }

  // Category synonym bonus
  const synonyms = CATEGORY_SYNONYMS[category] ?? [];
  for (const syn of synonyms) {
    if (haystack.includes(syn)) {
      score += 3;
      break; // only award the bonus once per market
    }
  }

  return score;
}

/** Resolve country name from event metadata */
function resolveCountry(event: NormalizedEvent): string {
  const meta = event.metadata;
  return (
    (typeof meta['country'] === 'string' ? meta['country'] : '') ||
    (typeof meta['countryName'] === 'string' ? meta['countryName'] : '') ||
    ''
  );
}

export function matchEventsToMarkets(
  event: NormalizedEvent,
  polymarkets: unknown[],
  manifoldMarkets: unknown[],
): MarketMatch[] {
  const eventText = eventSearchText(event);
  const eventKeywords = extractKeywords(eventText);
  const country = resolveCountry(event);

  const results: MarketMatch[] = [];

  // Score Polymarket entries
  // PolymarketMarket shape: { id, question, probability, url }
  for (const raw of polymarkets) {
    const m = raw as Record<string, unknown>;
    const question = typeof m['question'] === 'string' ? m['question'] : '';
    if (!question) continue;

    const score = scoreMarket(question, eventKeywords, country, event.category);
    if (score < 1) continue;

    results.push({
      id: String(m['id'] ?? ''),
      question,
      url: typeof m['url'] === 'string' ? m['url'] : undefined,
      probability: typeof m['probability'] === 'number' ? m['probability'] : undefined,
      source: 'polymarket',
      score,
    });
  }

  // Score Manifold entries
  // PredictionMarket shape: { id, question, probability, volume24h, url, source }
  for (const raw of manifoldMarkets) {
    const m = raw as Record<string, unknown>;
    const question = typeof m['question'] === 'string' ? m['question'] : '';
    if (!question) continue;

    const score = scoreMarket(question, eventKeywords, country, event.category);
    if (score < 1) continue;

    results.push({
      id: String(m['id'] ?? ''),
      question,
      url: typeof m['url'] === 'string' ? m['url'] : undefined,
      probability: typeof m['probability'] === 'number' ? m['probability'] : undefined,
      source: 'manifold',
      score,
    });
  }

  // Sort by score descending, cap at 5
  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}
