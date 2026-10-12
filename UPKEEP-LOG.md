# Vigil upkeep log

One entry per weekly maintenance run (see UPKEEP.md).

## 2026-10-07 (set up by hand)
- Hotspot tracking, outside watchlists, surge detection and coverage checks shipped. Curated list reviewed today. CrisisWatch September/October 2026 edition stored by hand (feed refuses GitHub runner).

## 2026-10-07 (weekly run)
- **Data flow:** fine. `status.json` refreshed 14:55 UTC. The workflow runs less often than every half hour (gaps of up to 6 h), but it hasn't stalled.
- **Dead sources:** Arab News and The Irrawaddy (both added today) returned HTTP 403 on every GitHub run. I replaced The Irrawaddy with DVB English (`english.dvb.no/feed/`: 200, valid RSS, newest item from today). I removed Arab News: it answers locally but blocks GitHub's servers, and The National and Asharq Al-Awsat already cover the Gulf. Human Rights Watch got a 403 on the latest run only, so I left it. The GDELT 429s are expected.
- **Coverage vs. the week's news:** France lycée protests, Spain housing protests and snap election, Ethiopia (federal recapture of Afar and Mekelle, Eritrean troops reported in Tigray), Sudan, Yemen/Houthi–Saudi, Mali (Kidal retaken), Pakistan–Afghanistan, Gaza/West Bank, Ukraine and Albania are all covered. Gaps I fixed in `hotspots.json`:
  - New: **Kosovo protests over the war crimes court** (Pristina clashes on 5 Oct).
  - New: **US military strikes on drug cartels** (Caribbean and Pacific boat strikes, >230 reported dead; Reaper drones moved to Colombia and Ecuador). Wikipedia lists it as ongoing, but it wasn't on the list.
  - France entry now covers the spread to Belgium (Liège riots on 1 and 6 Oct): Belgium added to `involved`, plus a Liège place and a search.
  - Updated the Ethiopia summary to match the early-October reversal and added a search for Eritrean troops in Tigray. Added a search each for Colombia (ELN rebels) and Ecuador (Noboa). Colombia went from thin (2) to covered (6).
- **Spot-check of 30 events:** places and categories are mostly correct. Sports headlines were leaking in as "conflict" (Asian Games, MTN8/Bafana, AFC Champions League), so I added a narrow sports pattern to `WORLD_NOISE`. Items carried forward from earlier runs also skipped `WORLD_NOISE`, even though the code comment says they are re-checked under current rules. Fixed that too.
- **Left alone:** Ecuador gang war is still quiet and Cameroon thin (1). English-language coverage is sparse this week; Google News returns almost nothing for them. Watchlist countries CAR, Rwanda and Belize are quiet, and Algeria, Bangladesh, El Salvador, Honduras and Eritrea are thin. That is driven by the outside lists; I found no news gap behind them.
- **Monthly:** curated list reviewed today and CrisisWatch is the latest edition (September Trends/October Alerts 2026), so neither was due.
- **Verified:** feed job in a copy, coverage report (no top hotspot worse; 1087 → 1152 events), `pnpm build`.

## 2026-10-12 (weekly run)
- **Data flow:** fine. `status.json` refreshed 08:55 UTC today (gaps of 4–9 h, not stalled). Chokepoints `through` is 2026-10-04: I queried the PortWatch service directly and its newest date is also 2026-10-04, so the lag is upstream; URL and fields still work.
- **Sources:** Reuters, Lawfare, Carnegie, SOFREP and SIPRI (all Google News site searches) returned "no items parsed" on the latest run but were fine three days ago, so I read it as Google throttling GitHub runners and left them. HRW still 403 (left, as last week). GDELT failures expected. No config changes.
- **Coverage vs. news:** Belgium anti-austerity riots (Brussels 9 Oct, 200+ arrests in Liège) were only covered as a side-note of the French protests. Added a dedicated `belgium-austerity-protests` hotspot (intensity 3); it shows as covered. Other major stories (Iran, Ukraine, Gaza, Sudan, Ethiopia, Yemen, US anti-ICE protests) are already on the list. Web search for the week was thin, so the check was not exhaustive.
- **Monthly:** curated list reviewed 2026-10-07 and CrisisWatch is the current edition, so neither due.
- **Verified:** feed job in a copy, coverage report (no hotspot went from covered to worse; counts move with the rolling window), `pnpm build`.
- **Follow-up (same run):** read the Intel Feed top 15 and spot-checked 30 items. The top 15 are serious events, though one boat wreck (139 dead) and one airstrike (72 miners) appear 2–3 times each from different outlets; I left that. Non-event items matched on a country name only (Egyptian femtech, Florida GoFundMe, unveiled artwork, ambassador courtesy calls, a commentary piece), so I added a narrow lifestyle pattern to `WORLD_NOISE`. Checked with the regex and `node --check`, plus `pnpm build`; the full feed job was not re-run for this one-line filter.
