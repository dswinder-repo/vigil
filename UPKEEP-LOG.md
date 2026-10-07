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
