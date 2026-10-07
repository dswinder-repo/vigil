# Vigil upkeep — instructions for the weekly maintenance run

Vigil (https://winder.works/vigil/) is a side project. It must keep working
and show accurate information to anyone who opens it, without its owner ever
thinking about it or hearing about it. A scheduled Claude run follows this
file once a week. You are that run. Fix what you find, verify it, push it.
Never contact the owner and never write anywhere outside this repository.

Read `README.md` first: it explains the feeds, the hotspot layers and the
files named below.

## 0. Setup

```bash
git pull --rebase origin main
node --version          # 20+
corepack enable || npm i -g pnpm
pnpm install --frozen-lockfile
```

Work in the repo, but run the feed job only in a copy (step 5): its output in
`public/data/` is written every half hour by the scheduled GitHub workflow and
must not be committed by you, except `public/data/watchlists.json` (step 4).

## 1. Is the data still flowing?

- `public/data/status.json` → `fetchedAt`. Older than 6 hours means the
  GitHub workflow (`.github/workflows/feeds.yml`) has stopped or is failing.
  `git log --format='%ci %s' -15 -- public/data/status.json` shows the recent
  refreshes. Reproduce by running the job in a copy (step 5) and fix the cause.
- Failing sources: `status.json` items with `ok: false`. Compare with the copy
  from about three days ago (`git log` to find a commit, then
  `git show <commit>:public/data/status.json`). A source failing in both is
  dead. Replace it in `scripts/feeds.config.json` with a working feed for the
  same region (verify: HTTP 200, valid RSS/Atom, newest item under 72 hours
  old), or remove it. GDELT failures (HTTP 429) are expected; ignore them.

## 2. Is the map covering what matters?

```bash
node scripts/coverage-report.mjs
```

Then check the world itself: search the news for the biggest conflict, unrest
and crisis stories of the past week, including domestic unrest anywhere (mass
protests, riots, coups, crackdowns, contested elections, curfews), Western
countries included. For each:

- On the list and covered: fine.
- On the list but `thin` or `quiet`: if it is still happening, improve its
  `searches`, `keywords` and `places` in `scripts/hotspots.json` (places are
  `["name", [lon, lat], "ISO3"]`, longitude first). If it has genuinely
  calmed down, lower its `intensity` or remove it.
- Not on the list and not picked up by the watchlists or surge detection:
  add it to `scripts/hotspots.json` (same shape as the existing entries;
  `countries` are the core countries where it happens, `involved` the rest).

Spot-check 30 random items in `public/data/world.json`: right place, right
category, actually an event? Systematic mistakes are fixed in
`scripts/geo/places.json`, `scripts/geo/countries.json` or the patterns in
`scripts/world.mjs`; one-offs are not worth chasing.

## 3. Monthly: refresh the curated list

If `reviewed` in `scripts/hotspots.json` is more than 28 days old, research the
world's hotspots afresh (wars, insurgencies, flashpoints, domestic unrest,
political crises, conflict-driven humanitarian crises) from current sources:
Crisis Group CrisisWatch, ACLED summaries, Wikipedia's ongoing conflicts and
protest lists, Carnegie's Global Protest Tracker, Reuters/AP/Al Jazeera/BBC.
Update every entry's `summary`, `intensity`, `searches` and `places`; add new
situations; remove ended ones. Set `reviewed` to today.

## 4. Monthly: CrisisWatch

Crisis Group publishes CrisisWatch at the end of each month. Its feed refuses
GitHub's servers, so the job keeps a stored copy in
`public/data/watchlists.json` → `crisiswatch`. If its `title` is not the
latest edition:

1. Try `curl -sL https://www.crisisgroup.org/rss.xml` and parse it with
   `parseCrisisWatch()` from `scripts/watchlists.mjs`.
2. If that is refused, search the web for the latest "CrisisWatch <Month>
   <Year>" and read its Conflict Risk Alerts, Deteriorated Situations and
   Improved Situations lists.

Write `title`, `link`, `alerts`, `deteriorated`, `improved` (each a list of
`{ "slug": "...", "iso3": "..." }`), and set `parsedAt` and `fetchedAt` to now.
This is the one data file you commit.

## 5. Verify before pushing

```bash
rm -rf /tmp/vigil-check && mkdir -p /tmp/vigil-check/public
cp -R scripts /tmp/vigil-check/ && cp -R public/data /tmp/vigil-check/public/
(cd /tmp/vigil-check && node scripts/fetch-feeds.mjs | tail -15)
node scripts/coverage-report.mjs /tmp/vigil-check/public/data
pnpm build
```

All must succeed. The coverage report must not get worse for the top
hotspots than before your change (compare with the report from step 2). If a
change makes things worse, undo it.

## 6. Push

```bash
git pull --rebase origin main
git add <only the files you changed on purpose>
git commit -m "upkeep: <what changed>"
git push origin main
```

Never force-push. Pushing deploys the site (Vercel builds every push).

## 7. Record

Append a dated entry to `UPKEEP-LOG.md`: what you checked, what you changed,
what you left alone and why. Commit it with your changes (or alone, if you
changed nothing).

If something is broken that you could not fix (it needs an account, a
password or money), say so at the top of that log entry, and next week's run
will see it and try again. Nothing is sent anywhere else.

## Limits

- Do not change: `vercel.json`, `.github/workflows/` (unless the feed job is
  broken and the fix is there), dependencies in `package.json`, domains,
  secrets, or anything outside this repository.
- Do not delete working features. Do not rewrite the app.
- Prefer small, verified changes over large ones.
