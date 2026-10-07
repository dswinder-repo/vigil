#!/usr/bin/env node
/**
 * Print what the map shows for each hotspot, from the last feed run's output.
 * Run it after a change to the feeds or the matching, and before calling the
 * map verified:   node scripts/coverage-report.mjs [public/data]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'data');
const { items: hotspots, reviewed } = JSON.parse(readFileSync(path.join(dir, 'hotspots.json'), 'utf8'));
const world = JSON.parse(readFileSync(path.join(dir, 'world.json'), 'utf8')).items;

const byIso = new Map();
for (const w of world) if (w.iso3) byIso.set(w.iso3, (byIso.get(w.iso3) ?? 0) + 1);

console.log(`curated list last reviewed ${reviewed}; ${world.length} events on the map\n`);
console.log('int  status   pins48h  trend    source     hotspot');
for (const h of hotspots) {
  console.log(
    `${String(h.intensity).padEnd(5)}${h.status.padEnd(9)}${String(h.pins48h).padStart(7)}  ${h.trend.padEnd(9)}${h.source.padEnd(11)}${h.name}${h.signals ? `  [${h.signals}]` : ''}`,
  );
}
const top = [...byIso].sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log('\nbusiest countries on the map:', top.map(([k, v]) => `${k} ${v}`).join(', '));
