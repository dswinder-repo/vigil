# Vigil

Live at https://winder.works/vigil/

A map-first dashboard of world events, markets and military activity, built
from free public feeds.

## How it runs

- **Feeds.** `.github/workflows/feeds.yml` runs `scripts/fetch-feeds.mjs` on a
  schedule. It fetches every source server-side (sources are listed in
  `scripts/feeds.config.json`) and commits the results to `public/data/`.
  Health of every source is in `public/data/status.json`.
- **Site.** Vercel project `vigil` builds this repo on every push to `main`,
  including the feed commits. The app is built into `dist/vigil/`, so the
  deployment answers at `/vigil/`.
- **Domain.** winder.works is the Vercel project `fwd` (repo `fwd-v2`). Its
  `next.config.ts` rewrites `/vigil/*` to this project's deployment.
- **Env.** `VITE_FIRMS_API_KEY` (free NASA FIRMS key) is set on the Vercel
  project and in a local `.env`. Without it the fire layer is off.

## Hotspots: how the map keeps up with the world

The world layer (conflict, unrest, political, humanitarian events) is built in
`scripts/world.mjs` from every headline the job collects: the news and OSINT
feeds, 35 regional feeds (`regional` in `feeds.config.json`), and a Google
News search for each hotspot. A headline is placed by the place it is about
(any country by name, demonym or capital, plus cities, regions and
chokepoints in `scripts/geo/`), and the map shows the last 48 hours.

Which places count as hotspots is decided in three layers, rebuilt every run:

1. **Curated** — `scripts/hotspots.json`: researched list with keywords,
   places and searches. The floor, not the ceiling. Review monthly; the job
   reports it as due 45 days after `reviewed`.
2. **Outside watchlists** — `scripts/watchlists.mjs`, refreshed daily:
   Wikipedia's *List of ongoing armed conflicts*, Crisis Group's monthly
   CrisisWatch alerts, and Carnegie's Global Protest Tracker. Any country they
   name that the curated list misses becomes a hotspot with its own searches,
   and leaves when they drop it.
3. **Surge detection** — each country's daily event count against its own
   30-day normal (`public/data/hotspot-history.json`). A country running at
   three times its normal is added automatically and kept while it stays busy.

Every hotspot's event count is checked each run. Thin or empty coverage of a
serious hotspot is written to `public/data/status.json` (group `coverage`)
and shown in the Hotspots panel. To see it all at once:

```bash
node scripts/coverage-report.mjs
```

Run that before calling the map verified.

## Local

```bash
pnpm install
pnpm dev                     # http://localhost:5173/vigil/
node scripts/fetch-feeds.mjs # refresh public/data/ by hand
```

The repo sits in iCloud Drive, which makes builds very slow there. Build a copy
outside iCloud if `pnpm build` hangs.
