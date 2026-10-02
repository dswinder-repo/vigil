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

## Local

```bash
pnpm install
pnpm dev                     # http://localhost:5173/vigil/
node scripts/fetch-feeds.mjs # refresh public/data/ by hand
```

The repo sits in iCloud Drive, which makes builds very slow there. Build a copy
outside iCloud if `pnpm build` hangs.
