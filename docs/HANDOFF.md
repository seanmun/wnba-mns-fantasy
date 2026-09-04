# WNBA — where the build stands (2026-09-03)

Read the workspace `CLAUDE.md` first (traps, idea gate, UX constitution,
max-4-sentence replies). This file is the WNBA-specific handoff; the
test plan lives in `TEST-PLAN.md` beside it.

## What shipped this session (commits a5e9048, e90a957)

The app went from "commissioner setup wizard + 34 stub pages" to a
playable league. Draft → matchups → standings works end-to-end; waivers
and trades do not exist yet.

**Foundation**
- mns-ui theme system wired (both themes, ThemeToggle in header).
  `bg-mns-card/dark/hover` had been defined NOWHERE and rendered
  nothing — they are real themed tokens now.
- `LeagueTopNav`/`LeagueBottomNav` were stubs; now real. Constitution
  tabs: Home · My Team · Standings. ALL `/lm/*` routes moved inside
  `/league/:id/lm/*`; `LeagueLayout` syncs LeagueContext from the URL
  param — the localStorage wrong-league trap is dead.
- Real pages: LeagueHome (teams grid + week matchups), Standings,
  OwnerDashboard (`/my-team` resolves the caller's team; `/team/:id`
  shows any), MatchupDetail (category table + player week lines),
  Draft (full room), AdminDraftSetup.
- Owner invites SEND now (`api/_email.ts` + `_emailTemplate.ts` ported
  from NFL, MNSWNBA wordmark) from team creation in
  `api/leagues/[id]/teams.ts`. Sign-up with the invited address links
  the team via the existing `users/sync`.
- `tsconfig.api.json` added and wired into `npm run build` — the
  serverless functions were NEVER typechecked before (the exact trap
  behind NFL's all-500s outage). Verified it bites.

**Draft (hub engine — the platform law: games never own drafts)**
- `api/_draftService.ts` (copied from golf), `api/leagues/[id]/draft.ts`:
  create / start / pause / resume / restart / sync / set_pace, plus GET
  {draftId, status, pace} for the room.
- Draft id lives in `wnba.drafts` (id = hub draft id); `settings.pace`
  = 'live' (120s clock) or 'slow' (pickSeconds null → hub's 12h
  slowPickHours + on-the-clock emails). Pace is switchable until the
  draft starts (setup page button).
- Picks sync into `mnsPlayers.teamId` keyed by participant userId →
  owner's team, which is why ONE PERSON CANNOT OWN TWO DRAFTING TEAMS
  (create/start throw a named error). Keepers
  (`keeperPriorYearRound != null`) survive restart.
- The room polls the hub every 5s with the member's own Clerk token
  (shared instance); queue reorder, autodraft toggle, expiry nudge to
  `/api/cron/draft-clock`, auto-sync on completion — all golf's proven
  patterns.

**Season engine**
- `POST start-season` now generates the schedule in the same
  transition: week rows from `src/rules/scheduleRules.generateWeeks`
  (needs `config.season.startDate`!) + round-robin matchups
  (`src/lib/season/schedule.ts`, circle method, home/away alternates).
- `wnba.player_stat_lines` (new table): one row per player per Eastern
  date, raw components only. Unique on (league, player, date) —
  re-ingest is idempotent.
- Two stat sources, one contract (`src/lib/season/statSources.ts`):
  - `sim` — mulberry32 seeded by (playerId, date): deterministic,
    salary-weighted, rostered players only, occasional DNP.
  - `espn` — free public API (no key): scoreboard by date → summary
    per event → per-player box lines, matched by normalized name.
    Unmatched names logged + returned — nobody silently scores zero.
  - Chosen per league: `config.season.statSource` ('espn' default).
- `api/cron/season-tick.ts` (vercel.json cron, hourly): for every
  `regular_season` league, ingest yesterday+today (in-season dates
  only), rescore affected weeks. Full recompute every pass —
  corrections and re-runs always converge.
- Scoring (`src/lib/season/score.ts`): 9-cat totals per team per week
  (whole roster — DAILY LINEUPS ARE DELIBERATELY OUT for the test;
  `mnsDailyLineups` stays dormant); ratio cats computed from raw sums,
  never averaged; `computeMatchupResult` from the tested rules; matchup
  `status` scheduled→live→final (final once Eastern today > week end
  date); ONLY final weeks bank records into standings, category wins
  are pointsFor/tiebreak.

## What is NOT built yet (the queue)

1. **Waivers** — golf's model is the template (`golf-mns-fantasy`:
   `api/pools/waivers.ts`, `src/lib/waivers/engine.ts`): claim windows,
   one transaction per team per window, ordered preference list
   (`add_golfer_ids` analog), priority by standings, processed by cron,
   public transaction log. WNBA shape: claims during the week,
   processed at week rollover in `season-tick` after finalize;
   FreeAgents page (stub) becomes the claim UI. `mnsWagers`/
   `mnsWatchlists` tables exist unused.
2. **Trades** — propose/accept between teams, validate with
   `src/rules/tradeRules.ts` (tested, unwired), execute into
   `mnsPlayers.teamId`, log. `mnsTradeProposals` +
   `mnsTradeProposalResponses` tables exist unused. TradeMachine and
   Inbox pages are stubs. Respect `mnsLeagueWeeks.isTradeDeadlineWeek`.
3. **Known smaller gaps**: `LeagueManagerHub` (/lm) is still a stub
   (checklist links work around it); `POST /api/notifications/telegram`
   is called by `src/lib/logger.ts` but doesn't exist (error alerts
   404 silently); `api/_rateLimit.ts` exported, used by nothing;
   teams endpoint returns full owner emails to any member (should be
   manager-only like NFL); ~26 other stub pages (About/Privacy/etc.,
   rookie-draft suite, site-admin suite) — not needed for the test.

## Traps for the next session

- `generateSeasonSchedule` CLEARS AND REBUILDS weeks+matchups. Safe
  only before the first game counts. `start-season` guards itself with
  `seasonStartedAt` — there is deliberately no "restart season" yet.
- The sim writes lines only for ROSTERED players; free agents at 0 by
  design (a waiver wire that lies was the alternative).
- ESPN name matching: pool names come from Her Hoop Stats. Watch the
  season-tick logs for `unmatched ESPN names` before trusting a real
  week.
- Vercel env needed on the wnba project: `RESEND_API_KEY`,
  `RESEND_FROM_EMAIL`, `DRAFT_SERVICE_SECRET`, `CRON_SECRET` (tick
  auth). `PLATFORM_API_URL` deliberately unset in prod (falls back to
  the live hub) and REQUIRED in `.env.local` (loud fail — golf's
  landmine, avoided).
- Claude never touches Vercel env; Sean does (workspace CLAUDE.md law).
