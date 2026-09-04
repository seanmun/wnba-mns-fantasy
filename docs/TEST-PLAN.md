# WNBA test plan (written 2026-09-03)

Two rounds: Sean's solo dry run (running NOW), then a 4-team league
with real people. Goal for the real round: draft, weekly matchups,
waivers, standings, trades — the full loop Sean asked for.

## Round 1 — dry run: "Beta Babes" (in progress)

- League id `beta-babes-2026-9y5kio`. Config already set by Claude via
  DB: `season = { startDate: '2026-08-31', weeks: 1, statSource:
  'sim' }`.
- Hub draft `82010db6-33f7-4d1b-b57e-5cdc020cab49`, pace SLOW (12h a
  pick, hub emails on the clock). Sean started it 2026-09-03; expected
  to run a few days with his two accounts (smunley13@gmail.com +
  seanmunley1@yahoo.com).
- When the draft completes: picks auto-sync to rosters. **Before
  pressing Start Season, move `season.startDate` forward** (it's
  currently Aug 31 for plumbing tests; a week that's already over
  would finalize on the first tick). Set it to the Monday of whatever
  week the draft finishes in, then Start Season → schedule generates →
  next hourly tick writes sim lines → LeagueHome shows the live
  matchup.
- Verifying: matchup goes live with category scores; MatchupDetail
  shows per-player sim lines; Standings banks the record after the
  week's Sunday passes; invite emails arrived; both themes on phone.
- Manual tick (don't wait an hour):
  `curl -X POST https://wnba.mnsfantasy.com/api/cron/season-tick -H
  "Authorization: Bearer $CRON_SECRET"` (secret in Vercel / .env.local).

## Round 2 — the real test: 4 teams, 2 weeks (~Sept 8 → Sept 20)

Create a FRESH league (clean history reads better for testers; Beta
Babes stays a sandbox).

- Setup: scenario "Brand new league"; 4 teams, one owner each (one
  person per team — the draft REQUIRES it); populate pool; config
  `season = { startDate: '2026-09-07', weeks: 2, statSource: 'sim' }`.
- Timing context: FIBA break = NO WNBA games until Sept 17. So week 1
  (Sept 7–13) runs on the simulator; on Sept 14 flip
  `season.statSource` to `'espn'` (one jsonb update or the league
  settings editor) so week 2 (Sept 14–20) scores real box scores from
  the games that resume Sept 17. Sim lines and real lines never mix in
  one week.
- Draft: slow pace recommended (testers are scattered); watch that
  on-the-clock emails land and autodraft covers an absent tester.
- Week 1 exercises: draft completion → rosters; Start Season; daily
  sim scoring; standings after Sunday; waivers (BUILD FIRST — queue
  item 1) mid-week; a trade (BUILD FIRST — queue item 2).
- Week 2 exercises: real ESPN ingestion — check season-tick logs for
  `unmatched ESPN names` on Sept 17 night and fix the pool names it
  reports; matchup finalization on Sept 20; final standings + champion.
- 60-second rule spot-checks (constitution law): a tester finds their
  team, their matchup, and the waiver wire from a cold login on a
  phone in under a minute. If they can't, that's a launch blocker, not
  a nice-to-have.

## What must be BUILT before Round 2 starts

1. Waivers (docs/HANDOFF.md queue item 1)
2. Trades (queue item 2)
3. Nice-to-have if time allows: /lm hub page (currently a stub with
   working checklist links around it), owner-email redaction for
   non-managers.
