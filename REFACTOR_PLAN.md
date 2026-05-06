# MNS — Build Plan for `wnba-mns-fantasy/`

> Companion to [FEATURES.md](FEATURES.md) — feature inventory the new app must preserve.
> Companion to [SCAFFOLD_PLAN.md](SCAFFOLD_PLAN.md) — file-by-file scaffold spec.
>
> Goal: build a new `wnba-mns-fantasy/` app at `wnba.mnsfantasy.com` on the **Clerk + Neon + Drizzle + Vercel** stack used by sibling apps. WNBA-only to start; sport-neutral internals so NBA can be added (or duplicated) later.
>
> The current [`mns/`](.) app stays frozen on Supabase. The new app is built fresh next door — not a migration of code, but a clean rebuild guided by [FEATURES.md](FEATURES.md) so nothing's lost.

The lifecycle phases are fixed:

```
Rookie Draft → Keeper Season → Draft → Regular Season → Playoffs → Champion
```

Any user must be able to enter the system at any phase, for either an existing dynasty (migrating from ESPN/Yahoo/Sleeper) or a brand-new league.

---

## 1. What's wrong with the current `mns/` build

A blunt audit of why we're rebuilding rather than patching.

### 1a. NBA assumptions baked into core logic
- [`keeperAlgorithms.ts`](src/lib/keeperAlgorithms.ts) hardcodes `13` (round count) in **6 places**.
- [`computeSummary`](src/lib/keeperAlgorithms.ts) defaults to NBA dollars (`$225M`, `$195M`).
- [`OwnerDashboard.tsx`](src/pages/OwnerDashboard.tsx) falls back to `|| 13` in 5 places when a player has no prior keeper round.
- DB column `nba_team` holds WNBA teams.
- `NBA_CAP_DEFAULTS` / `WNBA_CAP_DEFAULTS` exist in types but most call sites use hardcoded NBA values.

### 1b. No "first-year dynasty" / migration concept
- Player keeper round derives from `rookieDraftInfo` OR `keeper.priorYearRound`. ESPN/Yahoo/Sleeper imports have neither → silent fallback to round 13.
- No tool to bulk-set keeper rounds. Roster importer touches `team_id` and `slot`, never `keeper_prior_year_round`.
- No way to skip Rookie Draft or enter at Draft / Regular Season / Playoffs / Champion.
- No way to migrate a regular-season roster, draft state, or final standings.

### 1c. League config is not the rule book
- `LeagueRosterSettings` / `LeagueCapSettings` / `LeagueFeeSettings` exist as types but algorithms read from defaults, not the league row.
- Schedule generation has NBA-specific logic (Cup weeks, All-Star break) hardcoded in [`scheduleUtils.ts`](src/lib/scheduleUtils.ts).
- Scoring categories (9-cat) are global constants, not configurable.

### 1d. Brittle state on the Owner Dashboard
- 5 different load paths (submitted, scenario, clean slate, no roster, etc.).
- Saved scenarios merge with current team players without filtering for stale player IDs (the bug that wiped your keepers).
- Local component state and DB state can disagree silently.

### 1e. Multi-tenant grafted on top of single-league assumptions
- [`LeagueContext`](src/contexts/LeagueContext.tsx) added late; some pages still query `supabase.from('leagues')` directly.
- Hardcoded admin email (`smunley13@gmail.com`).
- Authorization scattered across pages; no centralized check.

### 1f. Surface area too big for the foundation
- 45 pages, 27 components, 14 lib files, 23 migrations, no service layer, no tests.
- Sticky first-apron + watermark second-apron logic duplicated across pages.

---

## 2. Design principles

1. **League config is the rule book.** Every parameter (cap, rounds, keeper count, scoring, fees, schedule, prize pool) lives on the `leagues` row. No hardcoded constants in algorithms.
2. **Sport is a preset, not a fork.** `wnba-mns-fantasy/` ships only the WNBA preset, but the rules engine is sport-neutral so NBA is a config addition, not a code rewrite.
3. **Phase entry, not phase progression.** Every phase has documented required inputs. The system never assumes you entered at Rookie Draft.
4. **Importers are first-class.** Each phase has a sanctioned importer that produces the minimum data needed to enter cleanly.
5. **API routes are the boundary.** All data access goes through `/api/*` routes. Pages never touch the database directly. Auth verified once per request.
6. **Validate at the boundary, trust internally.** Importers + API routes validate input via Zod. Once data is in the DB, downstream code trusts it.
7. **Don't paper over data gaps.** No silent `|| 13` fallbacks. If required data is missing, the importer collects it or the UI surfaces it.
8. **Preserve every feature in [FEATURES.md](FEATURES.md).** Anything dropped is a deliberate, documented decision.

---

## 3. Target stack

| Layer | Choice | Why |
|---|---|---|
| **Framework** | Vite + React 19 + TypeScript (strict) | Matches sibling apps; fast dev loop; SPA fine for this use case |
| **Styling** | Tailwind 4 | Already used in `mns/` and siblings |
| **Auth** | Clerk (`@clerk/clerk-react` + `@clerk/backend`) | Single Clerk app shared across `mnsfantasy.com` + all subdomains; cookie scope `.mnsfantasy.com` gives free SSO |
| **Database** | Neon Postgres (shared across game subdomains) | Same DB as `ncaa-mns-fantasy` and `golf-mns-fantasy`; tables namespaced with `wnba_` prefix |
| **ORM** | Drizzle ORM (`drizzle-orm/neon-http`) | Type-safe schema + queries; matches sibling apps |
| **Migrations** | `drizzle-kit` (`db:generate` / `db:push`) | Generated SQL, file-based, reviewable |
| **Server** | Vercel serverless functions (`api/*.ts`) | Matches siblings; 30s max duration; no separate backend |
| **Server state** | TanStack Query | Already in `mns/`; built-in polling |
| **Live updates** | Polling via `refetchInterval` (no realtime) | WNBA draft is slow-paced; 30s refresh acceptable |
| **Toasts** | Sonner | Already in `mns/` |
| **Errors** | Sentry | Already in `mns/`, DSN-gated, skips localhost |
| **Email** | Resend (existing `noreply@e.moneyneversleeps.app`) | Already configured |
| **Telegram** | Bot API direct from Vercel functions | Same two bots: `@mns_draft_bot`, `@mns_alert_bot` |
| **Storage** | Vercel Blob (when needed) | Replaces Supabase storage; simple SDK |
| **Validation** | Zod | Standard for both client forms and API request bodies |
| **Tests** | Vitest | New addition; pure-function tests for the rules engine |

### What we lose vs. Supabase (and how we handle it)

| Capability | Lost | Replacement |
|---|---|---|
| **Realtime subscriptions** | Yes | Polling via TanStack Query `refetchInterval`. Confirmed acceptable: WNBA draft is slow-paced. |
| **Row-Level Security** | Yes | Auth + ownership checks in every API route. More discipline; one missed check = data leak. |
| **Edge functions (Deno)** | Yes | Vercel serverless functions (Node). Same intent, different runtime. |
| **Built-in auth ↔ DB integration** | Yes | `useUserSync()` hook upserts Clerk user into `users` table on first load. |
| **Supabase Storage** | Yes | Vercel Blob for any file uploads (not used today; future-proofing only). |

---

## 4. Architecture

### 4a. Folder layout

```
wnba-mns-fantasy/
├── api/                              # Vercel serverless functions
│   ├── _db.ts                        # Drizzle client singleton (game-namespaced)
│   ├── _middleware.ts                # verifyAuth, isAdmin, isCommissioner, isTeamOwner
│   ├── _validation.ts                # Zod schemas
│   ├── _rateLimit.ts                 # in-memory rate limiter
│   ├── users/
│   │   └── sync.ts                   # POST /api/users/sync (Clerk → DB)
│   ├── leagues/
│   │   ├── index.ts                  # GET/POST list + create
│   │   ├── [id].ts                   # GET/PATCH/DELETE
│   │   ├── [id]/teams.ts             # team CRUD
│   │   ├── [id]/players.ts           # player CRUD
│   │   ├── [id]/rosters.ts           # keeper decisions + scenarios
│   │   ├── [id]/season-rosters.ts    # active/IR/redshirt/intl slots
│   │   ├── [id]/draft.ts             # draft state, picks
│   │   ├── [id]/pick-assignments.ts  # tradeable picks
│   │   ├── [id]/rookie-picks.ts      # rookie draft picks
│   │   ├── [id]/matchups.ts          # weekly matchups + scoring
│   │   ├── [id]/schedule.ts          # league_weeks generation
│   │   ├── [id]/fees.ts              # keeper_fees + team_fees
│   │   ├── [id]/trades.ts            # proposals + responses + execution
│   │   ├── [id]/wagers.ts            # wager CRUD
│   │   ├── [id]/watchlists.ts
│   │   ├── [id]/portfolio.ts         # wallet + zone calc
│   │   ├── [id]/phase-transition.ts  # rookie_draft → keeper → draft → ...
│   │   └── [id]/imports/             # phase-specific importers
│   │       ├── rookie-picks.ts
│   │       ├── roster.ts
│   │       ├── keeper-lock.ts
│   │       ├── season-roster.ts
│   │       ├── schedule.ts
│   │       ├── stats.ts
│   │       ├── standings.ts
│   │       ├── bracket.ts
│   │       ├── champion.ts
│   │       └── watchlist.ts
│   ├── prospects/                    # WNBA prospects (read-only for owners; admin write)
│   ├── stats/
│   │   ├── projected.ts
│   │   ├── previous.ts
│   │   └── sync.ts                   # external stats provider (when wired)
│   ├── scrape/
│   │   └── wnba-players.ts           # Her Hoop Stats scraper (port from existing)
│   ├── notifications/
│   │   ├── telegram.ts               # send via @mns_draft_bot or @mns_alert_bot
│   │   └── email.ts                  # Resend dispatch
│   ├── portfolio/
│   │   └── refresh.ts                # Alchemy + CoinGecko (port from existing)
│   └── admin/
│       ├── check.ts                  # GET /api/admin/check
│       ├── data-audit.ts
│       └── ... (cross-league site-admin endpoints)
│
├── drizzle/
│   ├── migrations/                   # generated SQL
│   └── schema.ts                     # re-export from src/lib/db/schema.ts
│
├── src/
│   ├── main.tsx                      # ClerkProvider + Sentry init + QueryClientProvider
│   ├── App.tsx                       # Router + ProtectedRoute + UserSync + ScrollToTop
│   ├── pages/                        # one file per route (mirrors mns/ FEATURES.md catalog)
│   ├── components/                   # reusable UI (CapThermometer, StackingAssistant, etc.)
│   ├── hooks/
│   │   ├── useApi.ts                 # authenticated fetch wrapper
│   │   ├── useUserSync.ts            # Clerk → DB on first load
│   │   ├── useLeagueConfig.ts        # central config getter
│   │   ├── useCanManageLeague.ts     # commissioner + admin check
│   │   ├── useRoster.ts              # keeper decisions
│   │   ├── useSeasonRoster.ts        # active/IR/redshirt
│   │   ├── useDraft.ts               # draft state with polling
│   │   ├── useMatchups.ts
│   │   ├── useTradeProposals.ts
│   │   ├── useWagers.ts
│   │   ├── useWatchList.ts
│   │   ├── useDailyLineup.ts
│   │   ├── usePreviousStats.ts
│   │   ├── useProjectedStats.ts
│   │   ├── useTeamFees.ts
│   │   └── useGames.ts
│   ├── lib/
│   │   ├── clerk.ts                  # publishableKey re-export
│   │   ├── db/
│   │   │   ├── index.ts              # Drizzle client singleton
│   │   │   └── schema.ts             # all WNBA tables (wnba_* prefix)
│   │   ├── api/                      # client-side API helpers (typed wrappers around useApi)
│   │   │   ├── leagueApi.ts
│   │   │   ├── teamApi.ts
│   │   │   ├── playerApi.ts
│   │   │   ├── rosterApi.ts
│   │   │   ├── draftApi.ts
│   │   │   ├── tradeApi.ts
│   │   │   ├── wagerApi.ts
│   │   │   └── ... (one per service)
│   │   ├── presets/
│   │   │   └── wnba.ts               # WNBA league config preset
│   │   ├── branding.ts               # logo, colors, copy, hinkie quotes — swappable
│   │   ├── logger.ts                 # info/warn/error/critical (critical → Telegram alert)
│   │   ├── nbaTeams.ts               # (NBA team codes — kept for cross-league reuse)
│   │   └── wnbaTeams.ts
│   ├── rules/                        # PURE FUNCTIONS, no DB
│   │   ├── capRules.ts               # apron penalties, sticky/watermark logic
│   │   ├── keeperRules.ts            # baseKeeperRound, stackKeeperRounds, computeSummary
│   │   ├── validationRules.ts        # validateRoster (collisions, eligibility)
│   │   ├── scoringRules.ts           # 9-cat or matchup-record W-L-T
│   │   ├── scheduleRules.ts          # week generation + combine/extend rules
│   │   ├── tradeRules.ts             # cap-impact validation, deadline check
│   │   ├── prizePoolRules.ts         # Boiler Room / Gekko / Bernie zone logic
│   │   ├── rookieKeeperMap.ts        # rookie pick → keeper round
│   │   └── lottery.ts                # rookie draft order
│   ├── importers/                    # CSV/TSV/JSON parsers (call API import endpoints)
│   │   ├── rosterImporter.ts
│   │   ├── rookiePickImporter.ts
│   │   ├── keeperLockImporter.ts
│   │   ├── seasonRosterImporter.ts
│   │   ├── scheduleImporter.ts
│   │   ├── standingsImporter.ts
│   │   ├── bracketImporter.ts
│   │   ├── championImporter.ts
│   │   ├── statsImporter.ts
│   │   ├── prospectImporter.ts
│   │   ├── watchlistImporter.ts
│   │   └── capAdjustmentImporter.ts
│   ├── data/
│   │   └── hinkieQuotes.ts           # ported from mns/
│   └── store/
│       └── index.ts                  # Zustand for font size, sounds, UI prefs
│
├── public/                           # icons, hinkie images, prize pool images, video
├── email-templates/                  # HTML templates for Resend
├── drizzle.config.ts
├── package.json
├── pnpm-lock.yaml or package-lock.json
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── eslint.config.js
├── vite.config.ts
├── vercel.json
├── index.html
├── .env.example
├── .gitignore
├── README.md
├── FEATURES.md                       # moved from mns/
├── REFACTOR_PLAN.md                  # this file, moved from mns/
└── SCAFFOLD_PLAN.md                  # detailed scaffold spec (file-by-file)
```

### 4b. League config (the rule book)

Single `league_config` JSONB on `wnba_leagues.config`:

```ts
interface LeagueConfig {
  sport: 'wnba';                       // fixed for this app; expandable to 'nba' | 'wnba' | 'custom' if NBA folds in
  season: { year: number; startDate: string; weeks: number };
  roster: {
    activeSize: number;                // WNBA: 11
    starterSize: number;
    irSlots: number;
    benchAllowed: boolean;
    maxKeepers: number;
    redshirtsAllowed: boolean;
    intStashAllowed: boolean;
  };
  draft: {
    rounds: number;                    // typically = activeSize, overridable
    type: 'snake' | 'auction';
    rookieRounds: number;
    rookieYearsTracked: number;
    rookieOrderMethod: 'lottery' | 'manual' | 'season_record';
    allowAdminOverride: boolean;
  };
  cap: {
    enabled: boolean;
    floor: number;
    base: number;
    firstApron: number;
    secondApron: number;
    hardCap: number;
    tradeDelta: number;
    penaltyRatePerM: number;
  };
  fees: {
    buyIn: number;
    firstApronFee: number;
    franchiseTagFee: number;
    redshirtFee: number;
    activationFee: number;
    penaltyRatePerM: number;
  };
  scoring: {
    categories: string[];
    mode: 'matchup_record' | 'category_record';
  };
  keeper: {
    rookieRoundMap: Record<string, number>;  // "1.1-1.3" → 5, "2.x" → 13, etc.
    advanceRule: 'minus_one' | 'flat' | 'custom';
    fallbackRound: number | null;            // null = require explicit value
    franchiseTagAllowed: boolean;
    intStashAllowed: boolean;
  };
  schedule: {
    tradeDeadlineWeek: number;
    tradeDeadlineDate: string;
    playoffTeams: number;
    playoffWeeks: number;
    playoffByeTeams: number;
    consolationWeeks: number;
    combineCup: boolean;
    combineAllStar: boolean;
    extendFirstWeek: boolean;
  };
  prizePool: {
    enabled: boolean;
    walletEnabled: boolean;
    zones: {
      boilerThreshold: number;
      bernieThreshold: number;
      gekkoSplit: [number, number, number];
      bernieSplit: number[];
      boilerSmallSplit: [number, number];
    };
  };
  notifications: {
    telegramEnabled: boolean;
    telegramChatId?: string;
    emailEnabled: boolean;
    drafts: boolean;
    trades: boolean;
    wagers: boolean;
  };
}
```

`src/lib/presets/wnba.ts` exports `WNBA_LEAGUE_PRESET` with sensible defaults. CreateLeague wizard picks the preset and exposes overrides.

### 4c. API routes

Every page interaction goes through an API route. Each route:

1. `verifyAuth(req)` returns Clerk user ID or 401
2. Authorization check (commissioner / team owner / admin) via `_middleware.ts` helpers
3. Validate request body via Zod schema in `_validation.ts`
4. Drizzle query
5. Return typed JSON

Pages call API routes through `useApi().apiFetch()` (typed wrappers in `src/lib/api/*`).

### 4d. Rules engine

`src/rules/*` — pure functions. No DB, no React, no Clerk. Take config + data, return computed result. **This is where the hardcoded `13`s, `$225M`s, and zone thresholds die.**

Tested with Vitest. Goal: >80% line coverage on `src/rules/`.

### 4e. Phase state machine

`leagues.league_phase` column with explicit transitions:

```
rookie_draft → keeper_season → draft → regular_season → playoffs → champion
```

Each transition has `canEnter(currentState, config): { ok, missing[] }`. The LM Hub displays the next phase and what's missing. Transitions are logged to `phase_transitions` for audit.

### 4f. Authorization layer

Centralized in `api/_middleware.ts`:
- `verifyAuth(req)` → Clerk user ID or null
- `isSiteAdmin(userId)` → DB-driven (no hardcoded emails); reads `users.role` column or env var with documented migration path
- `isCommissioner(userId, leagueId)` → checks `wnba_leagues.commissioner_id`
- `isTeamOwner(userId, teamId)` → checks `wnba_team_owners` join table (or `owners` array depending on schema decision below)
- `canManageLeague(userId, leagueId)` → site admin OR commissioner
- `canEditTeam(userId, teamId)` → site admin OR commissioner OR team owner

Every API route uses these. Hardcoded admin email gone.

---

## 5. Data model

### 5a. Shared tables (Neon DB, multi-game)

These already exist in the shared Neon DB via the NCAA app. WNBA app reuses them.

- `users` — Clerk user mirror (id = Clerk user ID, email, displayName, avatarUrl, createdAt)
- `marketing_subscribers` — global marketing opt-in
- `marketing_game_prefs` — per-game marketing preferences

### 5b. WNBA tables (new, prefixed `wnba_`)

Mirrors the current Supabase schema 1:1, with adjustments:
- All tables prefix `wnba_` for namespace clarity (and easy cross-game grep)
- `league_config` consolidated to a single JSONB
- New columns for migration support
- New tables for audit and bracket structure

```
wnba_leagues
  id (text PK)
  name, season_year, sport ('wnba')
  config (jsonb)                       -- LeagueConfig (Section 4b)
  league_phase
  keepers_locked
  commissioner_id (FK users.id)
  scoring_mode                         -- denormalized from config for query speed
  season_started_at, season_started_by
  telegram_chat_id
  created_at, updated_at

wnba_teams
  id (text PK)
  league_id (FK)
  name, abbrev
  telegram_username
  cap_adjustments (jsonb)              -- { tradeDelta }
  banners (int[])
  created_at, updated_at

wnba_team_owners                       -- replaces text[] owners array (cleaner relationships)
  team_id (FK)
  user_id (FK users.id)                -- nullable; supports invite-by-email pre-signup
  email                                -- always set
  display_name
  is_primary
  created_at
  PRIMARY KEY (team_id, email)

wnba_players
  id (text PK)
  fantrax_id (text unique)
  name, position
  salary
  team_code                            -- renamed from nba_team
  league_id (FK)
  team_id (FK, nullable for free agents)
  slot                                 -- active/bench/ir/redshirt/international
  on_ir
  is_rookie
  is_international_stash
  int_eligible
  rookie_draft_info (jsonb)
  keeper_prior_year_round
  keeper_derived_base_round
  migrated_keeper_round                -- NEW: for ESPN/Yahoo migrants
  migration_source                     -- NEW: 'espn'|'yahoo'|'sleeper'|'manual'|null
  created_at, updated_at

wnba_rosters                           -- keeper decisions per team per season
  id (text PK)                         -- {leagueId}_{teamId}_{seasonYear}
  league_id, team_id, season_year
  entries (jsonb)                      -- [{playerId, decision, baseRound, keeperRound, priority}]
  summary (jsonb)
  status                               -- 'draft'|'submitted'|'adminLocked'
  saved_scenarios (jsonb)
  UNIQUE (league_id, team_id, season_year)

wnba_regular_season_rosters
  id (text PK)                         -- {leagueId}_{teamId}
  league_id, team_id, season_year
  active_roster (text[])
  ir_slots (text[])
  redshirt_players (text[])
  international_players (text[])
  benched_players (text[])
  is_legal_roster
  last_updated, updated_by

wnba_daily_lineups
  id (text PK)                         -- {leagueId}_{teamId}_{YYYY-MM-DD}
  league_id, team_id, game_date
  active_player_ids (text[])
  updated_at, updated_by

wnba_drafts
  id (text PK)                         -- {leagueId}_{seasonYear}
  league_id, season_year
  status                               -- 'setup'|'in_progress'|'paused'|'completed'
  draft_order (text[])
  current_pick (jsonb)
  picks (jsonb)
  settings (jsonb)
  created_at, created_by, started_at, completed_at

wnba_pick_assignments                  -- tradeable picks (per-pick ownership)
  id (text PK)
  league_id, season_year
  round, pick_in_round, overall_pick
  current_team_id, original_team_id
  player_id, player_name
  is_keeper_slot
  picked_at, picked_by
  was_traded
  trade_history (jsonb)

wnba_rookie_draft_picks
  id (text PK)
  league_id, season_year
  round, pick_in_round, overall_pick
  team_id
  player_id, player_name
  created_at, updated_at

wnba_draft_history                     -- archived completed drafts
  id (text PK)                         -- {leagueId}_{seasonYear}
  league_id, season_year
  picks, keepers, redshirt_players, international_players (jsonb)
  completed_at, completed_by

wnba_games                             -- WNBA schedule
  id (text PK)
  season_year, game_date
  away_team, home_team
  is_cup_game (always false for WNBA today; kept for symmetry)
  notes

wnba_league_weeks
  id (text PK)
  league_id, season_year
  week_number, matchup_week
  start_date, end_date
  is_trade_deadline_week
  label

wnba_matchups
  id (text PK)
  league_id, season_year
  matchup_week
  home_team_id, away_team_id
  home_score, away_score (nullable)

wnba_keeper_fees                       -- locked one-time fees from keeper phase
  id (text PK)
  league_id, team_id, season_year
  franchise_tag_fees, redshirt_fees
  franchise_tag_count, redshirt_count
  locked_at, locked_by

wnba_team_fees                         -- season-long fees with sticky/watermark
  id (text PK)
  league_id, team_id, season_year
  franchise_tag_fees, redshirt_fees
  first_apron_fee                      -- sticky
  second_apron_penalty                 -- watermark
  unredshirt_fees
  fees_locked, locked_at
  fee_transactions (jsonb)
  total_fees

wnba_trade_proposals
  id (text PK)
  league_id, season_year
  proposed_by_team_id, proposed_by_user_id
  status                               -- 'pending'|'accepted'|'rejected'|'cancelled'|'expired'|'executed'
  assets (jsonb)
  involved_team_ids (text[])
  note, expires_at
  executed_at, executed_by

wnba_trade_proposal_responses
  id (text PK)
  proposal_id (FK)
  team_id
  status                               -- 'pending'|'accepted'|'rejected'
  responded_by, responded_at

wnba_wagers
  id (uuid PK)
  league_id, season_year
  proposer_team_id, opponent_team_id
  description, amount, settlement_date
  status                               -- 'pending'|'accepted'|'declined'|'live'|'settled'
  proposed_at, proposed_by
  responded_at, responded_by
  settled_at, winner_team_id

wnba_watchlists
  id (uuid PK)
  league_id, team_id
  player_ids (text[])
  updated_at
  UNIQUE (league_id, team_id)

wnba_projected_stats
  fantrax_id (text PK)
  name, team_code, position
  rk_ov, age, salary
  score, adp
  fg_percent, three_point_made, ft_percent, points, rebounds, assists, steals, blocks, assist_to_turnover, salary_score
  season_year

wnba_previous_stats
  fantrax_id (text PK)
  name, team_code, position
  fg_percent, ... (9-cat stats)
  season_year

wnba_prospects
  id (uuid PK)
  rank, player, school, year
  position, position_rank
  height, weight, age, hometown, high_school
  draft_year, draft_projection
  scouting_report, strengths (text[]), weaknesses (text[]), player_comparison
  sport ('wnba')
  created_at, updated_at

wnba_portfolios                        -- prize pool wallet tracking
  id (text PK)                         -- = league_id
  league_id
  wallet_address
  usd_invested
  cached_eth_balance, cached_usd_value, cached_eth_price
  last_updated

wnba_playoff_brackets                  -- NEW: explicit bracket structure
  id (text PK)
  league_id, season_year
  bracket (jsonb)                      -- seeds, rounds, matchup IDs
  consolation (jsonb, nullable)
  created_at, updated_at

wnba_prize_payouts                     -- NEW: final payout breakdown per season
  id (text PK)
  league_id, season_year
  zone                                 -- 'boilerRoom'|'gordonGekko'|'bernie'
  total_pool
  payouts (jsonb)                      -- [{place, percentage, amount, teamId}]
  created_at

wnba_league_imports                    -- NEW: importer audit log
  id (uuid PK)
  league_id
  importer                             -- 'roster'|'rookie_picks'|'keeper_lock'|...
  ran_by (FK users.id)
  ran_at
  file_hash
  result_summary (jsonb)

wnba_phase_transitions                 -- NEW: phase change audit log
  id (uuid PK)
  league_id
  from_phase, to_phase
  triggered_by (FK users.id)
  triggered_at
  preconditions_met (jsonb)
```

### 5c. Email templates table

Already exists in shared Neon DB or moved there. WNBA app reads/writes:
- `email_templates` (name PK, subject, html_body) — shared with NCAA/golf if naming is namespaced (`wnba_keeper_locked`), or stored under `wnba_email_templates` if isolation is preferred.

Decision needed (open question): shared or namespaced.

### 5d. Indexes (defined in Drizzle schema)

- All `league_id` FKs indexed
- `wnba_players (league_id, team_id)` composite
- `wnba_pick_assignments (league_id, current_team_id)` composite
- `wnba_team_owners (email)` for invite-by-email lookup
- `wnba_rosters (league_id, season_year)` for season filtering

---

## 6. Phase entry requirements

What data is required to legitimately enter each phase. Everything before the entry point is optional history.

### 6a. Rookie Draft
**Required:**
- League + config + commissioner
- Teams (with at least one owner each, abbrevs)
- Rookie pick assignments (round, pick, owning team) — generated for `rookieYearsTracked` years out
- Prospect pool (or empty pool the LM populates)

**Optional:** prior season standings (lottery odds), banners.

### 6b. Keeper Season
**Required:** everything from Rookie Draft, plus:
- Roster of players per team (salary, position, team designation)
- Per player: `rookieDraftInfo` OR `keeperPriorYearRound` OR `migratedKeeperRound`
- Cap adjustments per team (`tradeDelta`)
- Initial slot designation per player

**Optional:** prior-year redshirts, watchlists, scenarios.

### 6c. Draft
**Required:** everything from Keeper Season, plus:
- Locked keepers (`wnba_rosters.status = 'submitted'` or `'adminLocked'`)
- `wnba_keeper_fees` rows for every team
- `wnba_pick_assignments` rows for every round × team with `is_keeper_slot` set
- Draft order

### 6d. Regular Season
**Required:** everything from Draft, plus:
- Each team has a `wnba_regular_season_rosters` row populated
- Schedule generated (`wnba_league_weeks` + `wnba_matchups`)
- Players assigned (or marked free agent)
- Game schedule (`wnba_games`) for the season
- `wnba_team_fees` per team with first-apron + watermark baselines
- `season_started_at` set

### 6e. Playoffs
**Required:** everything from Regular Season, plus:
- Final standings
- `wnba_playoff_brackets` row with seeds, byes, rounds
- Trade deadline passed

### 6f. Champion
**Required:**
- Final bracket result
- `wnba_prize_payouts` row with zone + payouts breakdown
- Banner appended to winning team's `banners[]`

---

## 7. Migration support

### 7a. Fresh-start wizard

Phased CreateLeague:
1. Sport preset (WNBA-only for v1)
2. Entry phase (default Rookie Draft; commissioner picks any)
3. Override config knobs from preset
4. Add teams (manual + invite via email; invitees join when they sign in via Clerk)
5. Phase-required data (Section 6) via importers (Section 7b)

If entry phase isn't Rookie Draft, wizard skips earlier-phase prompts.

### 7b. Importers

| Phase | Importer | Inputs | Output |
|---|---|---|---|
| Rookie Draft | `RookiePickImporter` | rookie picks CSV (round, pick, owning team, year) | `wnba_rookie_draft_picks` |
| Rookie Draft | `ProspectImporter` | optional prospect pool | `wnba_prospects` |
| Keeper Season | `RosterImporter` | player roster CSV with `keeper_prior_year_round` OR `migrated_keeper_round` | `wnba_players` (sets team_id, slot, salary, keeper round) |
| Keeper Season | `CapAdjustmentImporter` | per-team `tradeDelta` overrides | `wnba_teams.cap_adjustments` |
| Keeper Season | `WatchlistImporter` | optional star-list per team | `wnba_watchlists` |
| Draft | `KeeperLockImporter` | locked keepers per team (round assignments) | `wnba_pick_assignments` (with `is_keeper_slot=true`) |
| Draft | `DraftOrderImporter` | snake order | `wnba_drafts.draft_order` |
| Regular Season | `SeasonRosterImporter` | active/IR/redshirt/intl slot assignments per team | `wnba_regular_season_rosters` |
| Regular Season | `ScheduleImporter` | optional game schedule + matchup overrides | `wnba_games`, `wnba_league_weeks`, `wnba_matchups` |
| Regular Season | `StatsImporter` | projected + previous stats CSV | `wnba_projected_stats`, `wnba_previous_stats` |
| Playoffs | `StandingsImporter` | final regular-season records | `wnba_playoff_brackets` (seeded) |
| Playoffs | `BracketImporter` | optional manual bracket | `wnba_playoff_brackets` |
| Champion | `ChampionImporter` | final winner + payouts | `wnba_prize_payouts`, `wnba_teams.banners` |

Every importer run logged to `wnba_league_imports`.

### 7c. Migration field semantics

`baseKeeperRound(player, config): number | null`:

```ts
if (player.rookieDraftInfo) {
  return config.keeper.rookieRoundMap[`${round}.${pick}`] ?? config.keeper.fallbackRound;
}
if (player.keeperPriorYearRound) {
  return advanceRule(player.keeperPriorYearRound, config);  // typically -1
}
if (player.migratedKeeperRound) {
  return player.migratedKeeperRound;  // already in MNS terms; importer handled translation
}
return config.keeper.fallbackRound;  // null → UI surfaces "needs admin"
```

No `|| 13`. Ever.

---

## 8. Build phases (work breakdown)

This is a **fresh ground-up build**, not a migration of `mns/` code. Order is what makes the WNBA season unblock-able as fast as possible.

### Phase 0 — Scaffold
Create [`wnba-mns-fantasy/`](../wnba-mns-fantasy/) per [SCAFFOLD_PLAN.md](SCAFFOLD_PLAN.md).
- Next folder, deps, configs, ClerkProvider, Drizzle client, vercel.json, .env.example
- Empty Vercel project deploys "hello world" with auth wall
- DNS: `wnba.mnsfantasy.com` → new Vercel project
- Clerk dashboard: add `https://wnba.mnsfantasy.com` to allowed origins
- Schema migration: create all `wnba_*` tables in shared Neon DB

### Phase 1 — Foundations
- `useUserSync` + `/api/users/sync` — Clerk user lands in `users` table
- `useApi` + `verifyAuth` middleware — authenticated fetch pattern
- `useLeagueConfig` hook
- Site shell: Header (with league switcher), Footer, ProtectedRoute, ScrollToTop
- LeagueContext (Clerk-aware version)
- Branding (`src/lib/branding.ts`) — copy from `mns/` assets

### Phase 2 — Rules engine + tests
- Port `keeperAlgorithms.ts` → `src/rules/keeperRules.ts` — config-driven, no hardcoded `13` or dollars
- Port `tradeCapCalculator.ts` → `src/rules/tradeRules.ts`
- Port `scheduleUtils.ts` → `src/rules/scheduleRules.ts`
- New: `src/rules/capRules.ts` (sticky/watermark logic in one place)
- New: `src/rules/prizePoolRules.ts` (zone calc out of LeagueHome)
- New: `src/rules/scoringRules.ts`, `src/rules/validationRules.ts`, `src/rules/rookieKeeperMap.ts`, `src/rules/lottery.ts`
- Vitest setup; tests for every rule function (target >80% coverage)

### Phase 3 — Phase-entry wizard + importers (UNBLOCK WNBA SEASON)
This is the priority. Once Phase 3 lands, you can stand up your WNBA league.
- CreateLeague wizard (sport preset, entry phase picker, config overrides)
- RosterImporter (CSV + prior-round capture + bulk-edit table) — first because it's what blocks today
- RookiePickImporter
- StatsImporter (so projected + previous stats are visible)
- WatchlistImporter (optional)
- All write through `/api/leagues/[id]/imports/*`

### Phase 4 — Owner Dashboard (Keeper Season)
- OwnerDashboard with one explicit load state machine (no 5 paths)
- KEEP/DROP/REDSHIRT/INT_STASH decisions
- StackingAssistant (visual round grid + auto-resolve)
- SavedScenarios (filtered to current team players — bug we hit)
- CapThermometer + SummaryCard
- Validation surfacing missing-keeper-round cases (no silent fallbacks)
- Submit + lock flow

### Phase 5 — League Manager Hub
- AdminLeague (config editing)
- AdminTeams + invite-by-email
- AdminRosterManager
- Phase transition button + `canEnter` check
- Start Season button (locks fees, applies first apron + watermark)

### Phase 6 — Draft
- AdminDraftSetup (reads keepers, generates pick_assignments)
- Draft (live board with 30s polling, on-clock UX, admin override)
- Telegram notification on pick (port from existing edge function)
- Test draft mode
- CompleteDraftModal + draft_history archive

### Phase 7 — Regular Season
- RegularSeasonRosterView (active/IR/redshirt/intl slots)
- DailyLineup (date picker + game info per player)
- FreeAgents (sortable, watchlist toggle, drop-to-add)
- Trade Machine + proposal flow + execution
- Wagers
- Schedule generation + matchups
- LeagueHome (standings, matchup of week, prize pool zone)

### Phase 8 — Stats sync + scrapers + portfolio
- Port WNBA scraper (Her Hoop Stats) to `/api/scrape/wnba-players`
- Port WNBA prospects scraper
- Port portfolio refresh (Alchemy + CoinGecko) to `/api/portfolio/refresh`
- StatsImporter wired to projected_stats / previous_stats

### Phase 9 — Notifications
- Telegram bot integration via `/api/notifications/telegram`
- Resend email templates + send via `/api/notifications/email`
- Inbox page (Hinkie quote, wager + trade proposals, archive)

### Phase 10 — Playoffs + Champion
- StandingsImporter + bracket generation
- Playoff matchups
- Champion phase: prize pool payout + banner append + wager settlement

### Phase 11 — Polish
- Public pages (Home, About, Roadmap, Privacy, Changelog, Media)
- PWA manifest, icons
- Code splitting (manual chunks per Vercel config)
- Image optimization
- Mobile/desktop nav split

### Phase 12 — Cutover
- Migrate `mns2026` league through importers (real-world test of the import path)
- Decide fate of `mns/`: archive or keep running for historical reads
- Decide fate of `moneyneversleeps.app`: redirect to wnba league URL or hold for future NBA app

---

## 9. What we keep, rewrite, drop

### Keep (port from `mns/`)
- All gameplay rules: cap, aprons, franchise tags, redshirts, prize pool tiers, lottery, sticky/watermark fees, scoring modes
- Telegram bots (`@mns_draft_bot`, `@mns_alert_bot`) and chat IDs
- Resend email setup
- Hinkie quotes data + images
- Branding assets (logos, icons, video, prize pool images)
- Mobile vs desktop nav patterns

### Rewrite
- Auth: Supabase Auth → Clerk
- DB: Supabase Postgres + RLS → Neon Postgres + Drizzle + API-route auth
- Realtime: Supabase Realtime → TanStack Query polling
- Storage: Supabase Storage → Vercel Blob (deferred until needed)
- Edge functions: Supabase Edge → Vercel Serverless Functions (Node)
- `keeperAlgorithms.ts` → config-driven `src/rules/keeperRules.ts`
- OwnerDashboard load logic → explicit state machine
- CreateLeague → phased wizard
- AdminRosterImport → real RosterImporter with prior-round capture
- All pages: direct DB → `useApi().apiFetch()` → `/api/*`

### Drop
- Hardcoded `smunley13@gmail.com` admin email
- `|| 13` fallbacks
- `DEFAULT_ROSTER_SETTINGS` and similar global constants
- `draftStatus` and `seasonStatus` columns (replaced by `league_phase`)
- Stale `rookieDraftInfo.redshirtEligible` check (now open per latest commit)
- README's outdated Firebase instructions (write fresh README)

---

## 10. Open questions

Answer before Phase 0 scaffolds. None are commitments — easy to change later.

1. **Redshirts open or eligibility-gated?** Latest `mns/` commit ripped out the eligibility check. Permanent? Document in `LeagueConfig.keeper`.
2. **WNBA round count.** Default = `roster.activeSize` (likely 11). Confirm.
3. **Migrated keeper round semantics.** From ESPN/Yahoo/Sleeper, does the round value mean (a) round kept *at* last year, (b) round to be kept *next* year, or (c) something else? Determines whether `advanceRule` runs on import.
4. **First-year dynasty bootstrapping.** Brand-new league, no platform history — what's the rule? Everyone starts at the same round? Salary-tier-based? Auction draft? Document in `LeagueConfig.keeper`.
5. **Multi-commissioner support.** One `commissioner_id` today. Co-commissioners? Add `wnba_league_commissioners` join table if yes.
6. **Site-admin role.** Hardcoded user IDs in `ADMIN_USER_IDS` env var (sibling pattern), or add `users.role` column? Lean toward column for promotability.
7. **Email template scope.** Shared `email_templates` (cross-game, namespaced names like `wnba_keeper_locked`) or `wnba_email_templates` (isolated)? Lean shared — fewer tables.
8. **Custom scoring categories.** Today 9-cat is hardcoded. Some leagues run 8-cat or H2H points. Scope or out-of-scope for v1? Lean OUT.
9. **Prize pool wallet — required?** `prizePool.walletEnabled` opt-in; LeagueHome degrades gracefully if disabled.
10. **Mock draft persistence.** Ephemeral or saved? Lean ephemeral (UI-only sandbox).
11. **Wagers settlement.** Manual today. Auto-settle for matchup-result wagers? Out-of-scope v1.
12. **Scoring mode mid-season swap.** Lock once season starts? Lean lock.
13. **Banner data source.** `banners[]` of years on team. Cross-league owner profile someday? Not v1.
14. **Realtime escape hatch.** Polling for now. If WNBA draft pace ever needs sub-second, add Pusher/Ably without architectural change?
15. **Rate limiting at scale.** In-memory per cold start (sibling pattern). Move to Upstash Redis when traffic justifies.

---

## 11. Out of scope (v1)

- Mobile native app
- Live scoring integration (Fantrax import remains the source of truth)
- Auction drafts (config supports `draft.type` but only snake ships)
- NBA preset (config-ready; ship as a separate decision)
- Sports beyond WNBA (architecture supports them; ship as separate apps)
- Auto-settlement of wagers
- Cross-league owner profile
- Detailed permission system beyond owner / commissioner / site-admin
- Custom scoring categories beyond preset 9-cat / H2H

---

## 12. Acceptance criteria for "v1 done"

- [ ] WNBA commissioner can stand up a fresh league at any of the 6 phases without code changes.
- [ ] WNBA commissioner can migrate from ESPN/Yahoo/Sleeper via CSV roster import with `migrated_keeper_round` populated.
- [ ] No `|| 13` fallbacks anywhere in `src/rules/` or `src/pages/`.
- [ ] `grep -r "225_000_000\|195_000_000" src/rules/` returns zero matches.
- [ ] `grep -r "supabase" src/ api/` returns zero matches.
- [ ] No direct DB calls from `src/pages/` or `src/components/` — all via `useApi().apiFetch()`.
- [ ] >80% line coverage on `src/rules/` (Vitest).
- [ ] Sign in on `mnsfantasy.com` keeps you signed in on `wnba.mnsfantasy.com` (and vice versa).
- [ ] Phase transitions logged to `wnba_phase_transitions`.
- [ ] Importer runs logged to `wnba_league_imports`.
- [ ] Every feature in [FEATURES.md](FEATURES.md) preserved or has a documented decision to drop/change.
- [ ] No hardcoded admin email; site-admin role is DB-driven.
- [ ] App passes Lighthouse perf > 80.

---

## 13. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Polling-based draft feels too laggy | Med | Med | Slow draft per user; if it bites, swap to Pusher (drop-in) — no schema/API change |
| Schema sharing with NCAA causes naming collision | Low | High | All WNBA tables prefixed `wnba_`; no overlap |
| Clerk subdomain SSO has edge cases | Low | High | Sibling apps prove it works; replicate exact ClerkProvider config; test on staging |
| Drizzle migration applied to wrong DB | Med | Critical | Use Drizzle Kit `db:generate` (no auto-apply); review SQL before `db:push`; CI guard |
| API auth check missed on a route | Med | High | Lint rule + code review; every handler must call `verifyAuth` first; default-deny pattern |
| ESM `_db.ts` bundling bug (golf app issue) | Low | High | Use `.js` import extensions; vercel.json `includeFiles` covers shared lib |
| Refactor blocks WNBA season start | Med | Critical | Phase 3 (importers + wizard) is sized to ship in days; keeper season can run before draft phase code lands |
| Vercel function 30s timeout hit on imports | Low | Med | Chunk large imports; stream via Vercel functions or batch inserts |
| Real-world data formats break importer assumptions | High | Med | Validate against actual ESPN/Yahoo exports before locking format; tolerant parser |
| Schema drift between local Drizzle and Neon | Med | Med | One developer; `db:push` after every change; document the rule |

---

*This is a multi-week ground-up rebuild done deliberately. The current `mns/` app keeps running on Supabase while the new app is built next door. Cutover happens at Phase 12 once `wnba.mnsfantasy.com` is proven on the new stack.*
