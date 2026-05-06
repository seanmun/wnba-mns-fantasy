# MNS — Complete Feature Inventory

This is the source of truth for "did the refactor preserve this feature?". Every distinct feature, capability, workflow, integration, and role-based behavior in the MNS app today.

Generated 2026-05-05 from a full codebase audit. Update this when behavior changes.

---

## 1. Public / unauthenticated

### Landing & entry
- **Home** [`/`](src/pages/Home.tsx) — hero with desktop/mobile background videos (`left-ball.mp4` / `center-ball.mp4` with custom 19.5s loop), gradient overlay, marketing copy. Auto-redirects authenticated users to `/teams` or `/league/:id`.
- **Login** [`/login`](src/pages/Login.tsx) — Google OAuth + email magic link via Supabase auth.
- **FinishSignIn** [`/finishSignIn`](src/pages/FinishSignIn.tsx) — completes magic-link flow.

### Public info pages
- **About** [`/about`](src/pages/About.tsx)
- **Privacy** [`/privacy`](src/pages/Privacy.tsx)
- **Roadmap** [`/roadmap`](src/pages/Roadmap.tsx)
- **Changelog** [`/changelog`](src/pages/Changelog.tsx)
- **Media** [`/media`](src/pages/Media.tsx)

---

## 2. Team Owner

### Multi-league
- **TeamSelect** [`/teams`](src/pages/TeamSelect.tsx) — list of leagues user owns a team in or commissions; create-league CTA.
- **CreateLeague** [`/create-league`](src/pages/CreateLeague.tsx) — wizard: name, season, sport (NBA/WNBA), initial teams, default cap/fee, commissioner = creator.
- **LeagueContext** [`AuthContext.tsx` + `LeagueContext.tsx`](src/contexts/LeagueContext.tsx) — switch active league via header dropdown; persists `currentLeagueId` in localStorage.

### Owner Dashboard — Keeper Season [`/league/:leagueId/team/:teamId`](src/pages/OwnerDashboard.tsx)
- KEEP / DROP / REDSHIRT / INT_STASH decision per player
- Per-player base round computed from `rookieDraftInfo` or `keeper.priorYearRound` (advances by 1)
- Real-time cap impact + fee breakdown (franchise tags, redshirts, apron charges, total dues)
- Round stacking via [`StackingAssistant`](src/components/StackingAssistant.tsx) — visualizes round 1–13 grid, detects collisions, runs Bottom-of-Draft auto-resolve, tags extra Round 1 keepers as franchise tags ($15 each)
- Saved keeper scenarios via [`SavedScenarios`](src/components/SavedScenarios.tsx) — save with custom name, load, delete; captures entries + summary; timestamp + author
- Submit final keepers (locks status to `submitted`; admin can flip to `adminLocked`)
- Validation: max keepers, INT_STASH eligibility, round collisions, missing rounds
- [`CapThermometer`](src/components/CapThermometer.tsx) — visual gauge: floor → first apron → second apron → max with color-coded zones, current usage, trade delta, fee summary

### Regular Season — same Owner Dashboard route, different view
- [`RegularSeasonRosterView`](src/components/RegularSeasonRosterView.tsx) — slots: active starters (default 10), bench (caps), IR (default 2, no cap), redshirt (unlimited, no cap), international (unlimited, no cap)
- Daily lineup prep: date picker, NBA game count for date, opponent + home/away + Cup-game flag per player, select up to 10 active for that day
- Drop / move-to-IR / activate-redshirt (charges $25 activation fee) / manual slot reassignment
- Live cap calc on active+IR; sticky first apron fee (locked once charged); watermark second apron penalty (highest-point-in-season; never decreases)
- Illegal-roster detection if active count > maxActive

### Watchlist & free agents
- [`WatchListView`](src/components/WatchListView.tsx) — star/unstar players from FA pool; persistent per-team in `watchlists` table
- [`FreeAgents`](src/pages/FreeAgents.tsx) `/league/:leagueId/free-agents` — search by name/position/team, sort by score/salary/9-cat stats, view projected + previous stats, add to watchlist; full roster forces drop-to-add

### Drafting [`Draft`](src/pages/Draft.tsx) `/league/:leagueId/draft`
- Real-time board via Supabase realtime on `drafts` table
- Round/pick view + player list view, search, position filter, sort, watchlist filter
- On-clock UX: pick a player, confirm, removes from pool, advances pointer, fires Telegram notification with `@username` mention if team has `telegram_username`
- Test draft mode visible only to admins (`isTestDraft: true`)
- Admin overrides: force pick, pause/resume, complete draft

### Rookie Draft [`RookieDraft`](src/pages/RookieDraft.tsx) `/league/:leagueId/rookie-draft`
- Display rookie picks grouped by round (rounds 1–3, configurable)
- Player + team + salary info per pick

### Prospects [`Prospects`](src/pages/Prospects.tsx) `/league/:leagueId/prospects`
- NBA prospects ranked, with scouting reports (strengths, weaknesses, player comp)
- WNBA prospects board (separate, when `league.sport = 'wnba'`)
- Position-based filtering, draft projection tiers, height/weight/school/class

### Mock draft [`MockDraft`](src/pages/MockDraft.tsx) `/league/:leagueId/mock-draft`
- Simulated draft for keeper-decision testing — no live writes

### Draft history [`DraftHistory`](src/pages/DraftHistory.tsx) `/league/:leagueId/draft-history`
- Archive of completed draft: keepers, drafted players, redshirts, international stashes
- Per-pick: round, salary, next-year keeper round

### Trades
- [`TradeMachine`](src/pages/TradeMachine.tsx) `/league/:leagueId/trade-machine` — multi-team builder; add/remove players + rookie picks (current + future years); per-team cap delta; trade-deadline + ±$40M cap-limit validation; expiration (minutes/hours/days); auto-propose to all involved teams
- [`TradeProposalCard`](src/components/TradeProposalCard.tsx) — pending proposal display, accept/reject/counter, expiration countdown, per-team response status
- [`tradeCapCalculator.ts`](src/lib/tradeCapCalculator.ts) — `computeTradeCapImpact()`
- [`tradeExecution.ts`](src/lib/tradeExecution.ts) — actually swaps team_id on players, swaps current_team_id on pick_assignments, writes `trade_history` entries

### Wagers
- [`ProposeWagerModal`](src/components/ProposeWagerModal.tsx) — opponent selector, description, amount, settlement date
- [`WagerProposal`](src/components/WagerProposal.tsx) — pending wager card, accept/decline
- [`useWagers`](src/hooks/useWagers.ts) — pending / live / settled lists
- Statuses: `pending` → `accepted` / `declined` → `live` → `settled` (with `winner_id`)

### Inbox [`Inbox`](src/pages/Inbox.tsx) `/league/:leagueId/inbox`
- Daily Hinkie quote (rotating, 8 quotes in [`hinkieQuotes.ts`](src/data/hinkieQuotes.ts) with images in `/public/hinkie/`); read-status tracked in localStorage per day
- Unread badge in header (custom `inboxRead` window event)
- Pending wagers + pending trade proposals (Active tab)
- Settled wagers + executed trades (Archive tab)

### Profile [`Profile`](src/pages/Profile.tsx) `/profile`
- Display name, email, sign-out

### League home [`LeagueHome`](src/pages/LeagueHome.tsx) `/league/:leagueId`
- Current phase display via [`PhaseDetail`](src/components/PhaseDetail.tsx) with phase-specific messaging
- Standings (W-L-T) — matchup-record or category-record mode
- Matchup of the week via [`MatchupCard`](src/components/MatchupCard.tsx)
- Prize pool tracking with Zone payouts:
  - **Boiler Room** (declined or <$300): 100% to 1st (if <$300) or 80/20 1st/2nd
  - **Gordon Gekko** (grew, <$10K): 70/20/10 to 1st/2nd/3rd
  - **Bernie** ($10K+): 40/15/9 + 4% each to 4th–12th
- Portfolio details (ETH balance, USD value, ETH price) when wallet configured
- Season selector (historical seasons)
- Live accepted wagers display + propose-wager CTA

### Matchup detail [`MatchupDetail`](src/pages/MatchupDetail.tsx) `/league/:leagueId/matchup/:matchupId`
- Home/away rosters; category-by-category scoring with W/L markers (category mode); final score; player stat lines

### Rules [`Rules`](src/pages/Rules.tsx) + [`LeagueRules`](src/components/LeagueRules.tsx) `/league/:leagueId/rules`
- League cap, roster, fee, keeper, scoring, trade, playoff config — all rendered from the league row

### Record book [`RecordBook`](src/pages/RecordBook.tsx) `/league/:leagueId/record-book`
- Championship history; team `banners` array (winning years); historical accomplishments

---

## 3. Commissioner / League Manager (`/lm/*`)

Gated by [`useCanManageLeague`](src/hooks/useCanManageLeague.ts) — user is `commissionerId` OR site admin.

### Hub
- [`LeagueManagerHub`](src/pages/LeagueManagerHub.tsx) `/lm` — links + status

### League config [`AdminLeague`](src/pages/AdminLeague.tsx) `/lm/league`
- Name, season year, scoring mode, sport
- Cap config (floor/base/aprons/max/trade limit/penalty rate)
- Roster config (active/starters/IR/keepers/rookieDraftRounds/rookieDraftYears/rookieDraftOrderMethod)
- Schedule config (numWeeks, seasonStartDate, tradeDeadlineWeek, playoffTeams, playoffWeeks, playoffByeTeams, consolationWeeks, combineCup, combineAllStar, extendFirstWeek)
- Fee config (buyIn, firstApronFee, penaltyRatePerM, redshirtFee, franchiseTagFee, activationFee)
- Telegram chat ID
- Phase management — display + transition button + "Start Season" (locks keeper fees + applies season fees)
- Cap-trade between teams (±$40M tradeDelta)
- Inline [`AdminRosterManagement`](src/components/AdminRosterManagement.tsx)
- Inline [`AdminMatchupManager`](src/components/AdminMatchupManager.tsx) — manual score input, override category wins
- Inline [`PlayoffConfig`](src/components/PlayoffConfig.tsx) — bracket structure, seeds, byes
- Inline [`ScheduleWeekPreview`](src/components/ScheduleWeekPreview.tsx) — generated weeks with NBA-game overlap detection

### Teams [`AdminTeams`](src/pages/AdminTeams.tsx) `/lm/teams`
- Team CRUD (name, abbrev, owner emails [array — co-ownership], owner names, telegram username)
- Banners (championship year array)

### Players [`AdminPlayers`](src/pages/AdminPlayers.tsx) `/admin/players`
- Bulk CSV upload via [`AdminUpload`](src/pages/AdminUpload.tsx) `/admin/upload`
- Edit individual: salary, position, NBA team, rookie flag, IR, INT stash, prior keeper round
- Delete

### Roster import [`AdminRosterImport`](src/pages/AdminRosterImport.tsx) `/lm/roster-import`
- Fantrax-format CSV/TSV
- Auto-match by fantrax_id, fallback to name match
- Maps status → slot (Act→active, Res→active, IR→ir, Min→redshirt)
- Bulk team_id assignment
- **Does NOT set `keeper_prior_year_round`** — this is the gap that makes ESPN migration broken today

### Roster manager [`AdminRosterManager`](src/pages/AdminRosterManager.tsx) `/lm/rosters`
- View all team rosters
- Move players between active/bench/IR/redshirt/international
- Manual salary adjustments

### Draft setup [`AdminDraftSetup`](src/pages/AdminDraftSetup.tsx) `/lm/draft-setup`
- Drag-to-reorder draft order
- Test draft toggle
- Generate draft → reads `rosters.entries` for `decision === 'KEEP'`, creates `pick_assignments` rows with `is_keeper_slot: true` for matching `keeperRound`
- Existing draft management (pause, resume, complete)

### Draft test [`AdminDraftTest`](src/pages/AdminDraftTest.tsx) `/lm/draft-test`
- Validate keeper-round calc + pick generation before going live

### Draft picks [`AdminDraftPicks`](src/pages/AdminDraftPicks.tsx) `/lm/draft-picks`
- Per-pick view; filter by round/team/status; manual reassignment; trade history

### Rookie picks [`AdminRookiePicks`](src/pages/AdminRookiePicks.tsx) `/lm/rookie-picks`
- Assign rookies to teams with round + pick number
- Generate rookie draft order
- Lottery support (via [`lottery.ts`](src/lib/lottery.ts))
- Bulk assignment

### Trade manager [`AdminTradeManager`](src/pages/AdminTradeManager.tsx) `/lm/trade`
- View pending proposals; force-execute / reject; admin-initiated trades; audit trail

### Portfolio [`AdminPortfolio`](src/pages/AdminPortfolio.tsx) `/lm/portfolio`
- Wallet address + manual USD-invested entry
- Refresh via [`get-portfolio-data`](supabase/functions/get-portfolio-data/index.ts) edge function (Alchemy + CoinGecko)
- Cached ETH balance, USD value, ETH price

### Email templates [`AdminEmailTemplates`](src/pages/AdminEmailTemplates.tsx) `/admin/email-templates`
- CRUD on `email_templates` table; `{{variable}}` interpolation; preview; test send

---

## 4. Site Admin (`/site-admin`, `/admin/*`)

Gated by `role === 'admin'` (currently hardcoded `smunley13@gmail.com`).

- [`AdminHub`](src/pages/AdminHub.tsx) `/site-admin` — entry to global admin
- [`AdminPicksView`](src/pages/AdminPicksView.tsx) `/admin/picks` — cross-league picks
- [`AdminMigration`](src/pages/AdminMigration.tsx) `/admin/migration` — data migration tools
- [`AdminDataAudit`](src/pages/AdminDataAudit.tsx) `/admin/data-audit` — integrity checks, anomaly flagging
- [`AdminProspects`](src/pages/AdminProspects.tsx) `/admin/prospects` — NBA prospect DB CRUD
- [`AdminWNBAScraper`](src/pages/AdminWNBAScraper.tsx) `/admin/wnba-scraper` — scrape WNBA players from Her Hoop Stats; also team-page scraper for rookies
- [`AdminWNBAProspects`](src/pages/AdminWNBAProspects.tsx) `/admin/wnba-prospects` — WNBA prospect DB CRUD
- [`AdminUpload`](src/pages/AdminUpload.tsx) `/admin/upload` — bulk player upload (CSV)

---

## 5. Cross-cutting capabilities

### Multi-league switching
- [`Header`](src/components/Header.tsx) league dropdown; persists in localStorage; refetches when role/user changes

### Sport handling (NBA vs WNBA)
- `Sport` type: `'nba' | 'wnba'`; on `Player` and `League`
- Distinct cap defaults: `NBA_CAP_DEFAULTS` vs `WNBA_CAP_DEFAULTS`
- Distinct fee defaults: `NBA_FEE_DEFAULTS` vs `WNBA_FEE_DEFAULTS` (WNBA: $50 buyIn, no aprons, no penalty)
- Separate prospect boards & scrapers
- DB column still named `nba_team` even for WNBA players
- 13-round draft hardcoded — incorrect for WNBA

### Phase gating [`phaseGating.ts`](src/lib/phaseGating.ts)
- Phases: `rookie_draft → keeper_season → draft → regular_season → playoffs → champion`
- `isPhaseActive`, `isPhaseComplete`, `isFeatureEnabled`
- Features per phase:
  - keeper_editing — keeper_season
  - draft_board — draft
  - roster_moves — regular_season + playoffs
  - free_agents — regular_season + playoffs
  - wagers — all
  - rookie_draft — rookie_draft
  - trade_proposals — keeper_season + draft + regular_season + champion + rookie_draft

### Realtime (Supabase)
- `drafts` (Draft.tsx) — auto-advance + current pick
- `players` (FreeAgents, Roster) — pickups/drops/trades
- `regular_season_rosters` — co-owner concurrent edits
- `rosters` ([`useRoster`](src/hooks/useRoster.ts)) — submitted/locked status updates
- `leagues`, `teams`, `wagers`, `pick_assignments`, `team_fees` (declared in migration `ALTER PUBLICATION supabase_realtime`)

### Telegram integration
- Two bots: `@mns_draft_bot` (picks) + `@mns_alert_bot` (system errors)
- Per-league `telegramChatId` (override) → fallback to env
- `@team.telegram_username` mentions in pick announcements
- Edge function: [`send-telegram`](supabase/functions/send-telegram/index.ts)

### Email integration (Resend)
- `email_templates` table; `{{var}}` interpolation
- From `noreply@e.moneyneversleeps.app`
- Edge function: [`send-email`](supabase/functions/send-email/index.ts)

### Blockchain / portfolio
- [`blockchain.ts`](src/lib/blockchain.ts) — wallet → ETH balance + USD value
- Edge function: [`get-portfolio-data`](supabase/functions/get-portfolio-data/index.ts) — Alchemy ETH mainnet + CoinGecko
- 1-hour cache TTL on prices
- Drives Boiler Room / Gekko / Bernie zone payouts on League Home

### Error tracking
- Sentry init in [`main.tsx`](src/main.tsx) — DSN-gated, skips localhost
- [`logger.ts`](src/lib/logger.ts) — `info / warn / error / critical`; critical also sends Telegram alert

### PWA
- Manifest at `/manifest.json`; icons multiple sizes; theme color `#0a0a0a`; standalone display
- Apple touch icons; iOS web-app meta

### Code splitting
- Most pages lazy-loaded via React.lazy + Suspense
- Manual chunks in [`vite.config.ts`](vite.config.ts): `vendor-react`, `vendor-supabase`, `vendor-query`, `vendor-utils`, `admin`, `create-league`
- Preloading in `AuthContext` after auth: TeamSelect → LeagueHome + OwnerDashboard → AdminTeams (if admin)

### Image optimization
- `vite-plugin-image-optimizer` (build-time) at q90
- Sharp CLI for manual webp generation (`npm run optimize-images`)
- All static images served as `.webp`

### Mobile vs desktop
- [`LeagueBottomNav`](src/components/LeagueBottomNav.tsx) — bottom tabs <lg breakpoint
- [`LeagueTopNav`](src/components/LeagueTopNav.tsx) — horizontal nav ≥lg
- Home video: left-ball desktop / center-ball mobile (custom 19.5s loop reset)
- [`PlayerModal`](src/components/PlayerModal.tsx) — responsive padding + stacked-vs-split layouts

---

## 6. Data model — every table

### Identity & access
- **profiles** — extends `auth.users`; email, display_name, role (`owner` / `admin`); auto-created via `handle_new_user()` trigger
- **waitlist** — non-member sign-up requests with marketing opt-in

### League core
- **leagues** — id (text), name, season_year, deadlines (jsonb), cap (jsonb), schedule (jsonb), keepers_locked, league_phase, draft_status (deprecated), season_status (deprecated), season_started_at, season_started_by, commissioner_id, scoring_mode, roster (jsonb), fees (jsonb), telegram_chat_id, sport
- **teams** — id, league_id, name, abbrev, owners (text[] emails), owner_names, telegram_username, cap_adjustments (jsonb: tradeDelta), settings (jsonb: maxKeepers), banners (int[])

### Players & rosters
- **players** — id, fantrax_id, name, position, salary, nba_team, league_id, team_id (nullable), sport, slot (active/bench/ir/redshirt/international), on_ir, is_rookie, is_international_stash, int_eligible, rookie_draft_info (jsonb: round/pick/redshirtEligible/redshirtedLastYear), keeper_prior_year_round, keeper_derived_base_round
- **rosters** — id (`{league}_{team}_{season}`), entries (jsonb: [{playerId, decision, baseRound, keeperRound, priority}]), summary (jsonb), status (`draft` / `submitted` / `adminLocked`), saved_scenarios (jsonb)
- **regular_season_rosters** — id (`{league}_{team}`), active_roster (text[]), ir_slots (text[]), redshirt_players, international_players, benched_players, is_legal_roster, last_updated, updated_by

### Drafts
- **drafts** — id (`{league}_{season}`), status, draft_order (text[] team IDs), current_pick (jsonb), picks (jsonb), settings (jsonb: allowAdminOverride, isTestDraft)
- **pick_assignments** — per-pick row; original_team_id, current_team_id, player_id (nullable), is_keeper_slot, was_traded, trade_history (jsonb [{from,to,tradedAt}])
- **rookie_draft_picks** — per-pick row for rookie draft
- **draft_history** — completed-draft archive: picks, keepers, redshirt_players, international_players

### Schedule & games
- **games** — id, season_year, game_date, away_team, home_team, is_cup_game, notes
- **league_weeks** — id, league_id, season_year, week_number, matchup_week, start_date, end_date, is_trade_deadline_week, label
- **matchups** — id, league_id, season_year, matchup_week, home_team_id, away_team_id, home_score, away_score
- **daily_lineups** — id (`{league}_{team}_{date}`), active_player_ids (text[]), updated_at, updated_by

### Fees
- **keeper_fees** — locked one-time fees from keeper phase: franchise_tag_fees, redshirt_fees, counts, locked_at, locked_by
- **team_fees** — season-long fees: franchise_tag_fees, redshirt_fees, first_apron_fee (sticky), second_apron_penalty (watermark), unredshirt_fees, fee_transactions (jsonb), total_fees

### Trades & wagers
- **trade_proposals** — proposed assets, involved_team_ids, status, expires_at, executed_at, note
- **trade_proposal_responses** — per-team response (pending/accepted/rejected)
- **wagers** — proposer/opponent teams, amount, settlement_date, status, winner_id

### Stats & scouting
- **projected_stats** — per-fantrax_id; rkOv, age, salary, score, adp, 9-cat stats, salaryScore (PPM), season_year (`2025-26`)
- **previous_stats** — per-fantrax_id; 9-cat stats, season_year (`2024-25`)
- **prospects** — id, rank, player, school, year, position, positionRank, height, weight, age, hometown, highSchool, draft_year, draft_projection, scouting_report, strengths/weaknesses (text[]), player_comparison, sport

### Misc
- **portfolios** — id (= league_id), wallet_address, usd_invested, cached_eth_balance, cached_usd_value, cached_eth_price, last_updated
- **watchlists** — id, league_id, team_id, player_ids (text[])
- **email_templates** — name, subject, html_body

### Cross-cutting
- `set_updated_at` trigger on every table
- RLS policies — authenticated read; admin/commissioner/owner-scoped writes
- Realtime publication on: `rosters`, `drafts`, `pick_assignments`, `wagers`, `team_fees`, `regular_season_rosters`, `leagues`, `teams`

---

## 7. Edge functions

| Function | Purpose | Inputs | Outputs |
|---|---|---|---|
| **send-email** | Resend dispatch via template | `{ template, to[], data }` | `{ success, messageId }` |
| **send-telegram** | Bot dispatch (draft / alert) | `{ message, botType, chatId? }` | `{ success, sent, failed }` |
| **get-portfolio-data** | EVM wallet balance + ETH price | `{ walletAddress }` | `{ ethBalance, ethPrice, usdValue, timestamp }` |
| **scrape-wnba-players** | Pull WNBA players from Her Hoop Stats | `{ scrapeHHS, scrapeTeamPages }` | `{ scrapedCount, players[] }` |
| **scrape-wnba-prospects** | Pull WNBA draft prospects | `{}` | `{ prospects[] }` |

---

## 8. Hidden / niche behaviors (don't drop these)

- **Daily Hinkie quote** — rotating daily, localStorage read flag, custom `inboxRead` event for header badge
- **Franchise tags** — extra Round 1 keepers cost $15 each; resolved in stacking algorithm
- **Redshirt** — $10 keeper-season fee, $25 mid-season activation; no cap impact while redshirt
- **International stash** — separate slot, no cap impact, eligibility flag (`int_eligible`)
- **Mid-season redshirt activation** — confirmation modal → fee → slot change → cap recalc
- **Saved keeper scenarios** — multiple "what-ifs" per roster, with metadata
- **Stacking assistant** — visual round grid + auto-resolve + franchise tag confirmation
- **Sticky first apron fee** — once charged in DB, locked; dynamic calc only if not yet charged
- **Watermark second apron penalty** — highest peak salary in season; never decreases even if salary drops
- **Cap trade between teams** — admin-only; ±$40M tradeDelta swap
- **Lottery** — randomized rookie draft order (alternative to manual / season_record)
- **Test draft mode** — `isTestDraft: true`; visible only to admins/commissioners
- **Pick ownership history** — `was_traded` + `trade_history[]` per pick
- **Co-ownership** — `teams.owners` is `text[]`; multiple emails on same team
- **Telegram @mentions** — pick notifications mention `@team.telegram_username`
- **Schedule combination** — `combineCup` (NBA Cup knockout weeks merge), `combineAllStar` (All-Star break merge), `extendFirstWeek` (week 1+2 merge if short)
- **Consolation bracket** — non-playoff teams play; best record gets top rookie draft odds
- **Category vs matchup scoring** — `scoringMode` switches standings calc + display
- **Game info on roster** — opponent + home/away + Cup-game flag per player per date
- **Banner array** — championship years on each team
- **Daily lineups** — per-game-date row with active player IDs (up to 10)
- **Prize pool zones** — Boiler Room / Gordon Gekko / Bernie with specific payout splits

---

## 9. Workflow examples (end-to-end)

### Keeper Season → Draft transition
1. League in `keeper_season`
2. Each owner makes KEEP/DROP/REDSHIRT/INT_STASH decisions; saves scenarios; runs stacking assistant; submits
3. Roster status → `submitted`; `keeper_fees` rows locked with franchise tag + redshirt charges
4. LM reviews + flips status → `adminLocked`; sets `keepers_locked: true`
5. LM runs `AdminDraftSetup` → reads all `rosters.entries[KEEP]`, generates `pick_assignments` for every team × every round, with `is_keeper_slot: true` for matching keeper rounds
6. LM transitions phase → `draft`

### Draft → Regular Season transition
1. Draft status `in_progress`; owners pick on the clock; Telegram fires
2. Admin can override or pause
3. LM clicks Complete Draft → archives picks to `draft_history`; phase → `regular_season`
4. LM clicks Start Season → applies first apron fee + initial second apron penalty + redshirt/franchise fees from `keeper_fees` to `team_fees`; locks fees; stamps `season_started_at`

### Regular Season trade
1. Owner builds trade in TradeMachine; adds players + picks; validates ±$40M cap; sets expiration
2. Proposal lands in opponent's Inbox; opponent accepts/rejects/counters
3. All involved teams must accept → `tradeExecution.executeTrade()` swaps `players.team_id` + `pick_assignments.current_team_id`; appends `trade_history` entries; updates statuses
4. Cap deltas auto-applied; first apron fee may trigger; second apron watermark may rise

### Playoff bracket
1. Phase → `playoffs` at regular-season end
2. Top seeds by record; byes for `playoffByeTeams`
3. Bracket runs N rounds (`playoffWeeks`); category or matchup scoring
4. Consolation bracket runs in parallel for non-playoff teams
5. Champion → phase `champion`; banner appended; prize zone payout calculated

---

This document is the contract for what the refactor must preserve. If a feature isn't here and exists in code, this doc is wrong — fix the doc.
