import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  uuid,
  numeric,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import type { LeagueConfig } from '../../types/leagueConfig'
import type { LeaguePhase, ScoringMode } from '../../types/league'
import type { TeamCapAdjustments } from '../../types/team'
import type {
  RosterEntry,
  RosterSummary,
  SavedScenario,
} from '../../types/roster'
import type {
  DraftPick,
  DraftSettings,
  DraftCurrentPick,
  PickTradeHistoryEntry,
} from '../../types/draft'
import type { TradeAsset } from '../../types/trade'
import type { RookieDraftInfo, MigrationSource } from '../../types/player'

// ============================================================================
// SHARED TABLES (cross-game on the same Neon DB)
// ============================================================================

// Matches the live shared `users` table created by ncaa-mns-fantasy.
// NOT-marking email .unique() here because the live table doesn't have
// that constraint (NCAA's TS schema declares it but never migrated).
// Pushing .unique() would prompt to truncate the table.
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('owner'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ============================================================================
// LEAGUES + TEAMS
// ============================================================================

// `sport` and `gameSlug` are the cross-platform discriminators. Together
// they're enough to identify a league across the multi-tenant Neon DB.
// `gameSlug` matches the NCAA convention ('mns-wnba-2026', 'mns-nba-2027')
// for filtering in shared tables like marketing_game_prefs / email_log.
export const mnsLeagues = pgTable(
  'mns_leagues',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    seasonYear: integer('season_year').notNull(),
    sport: text('sport').notNull(),
    gameSlug: text('game_slug').notNull(),
    config: jsonb('config').$type<LeagueConfig>().notNull(),
    leaguePhase: text('league_phase')
      .$type<LeaguePhase>()
      .notNull()
      .default('keeper_season'),
    keepersLocked: boolean('keepers_locked').notNull().default(false),
    commissionerId: text('commissioner_id').references(() => users.id),
    scoringMode: text('scoring_mode')
      .$type<ScoringMode>()
      .notNull()
      .default('category_record'),
    seasonStartedAt: timestamp('season_started_at'),
    seasonStartedBy: text('season_started_by'),
    telegramChatId: text('telegram_chat_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_mns_leagues_commissioner').on(t.commissionerId),
    index('idx_mns_leagues_game_slug').on(t.gameSlug),
    index('idx_mns_leagues_sport_season').on(t.sport, t.seasonYear),
  ]
)

export const mnsTeams = pgTable(
  'mns_teams',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    abbrev: text('abbrev').notNull(),
    telegramUsername: text('telegram_username'),
    capAdjustments: jsonb('cap_adjustments')
      .$type<TeamCapAdjustments>()
      .notNull()
      .default(sql`'{"tradeDelta":0}'::jsonb`),
    banners: integer('banners').array().notNull().default(sql`'{}'::integer[]`),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('idx_mns_teams_league').on(t.leagueId)]
)

export const mnsTeamOwners = pgTable(
  'mns_team_owners',
  {
    teamId: text('team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    displayName: text('display_name'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.email] }),
    index('idx_mns_team_owners_email').on(t.email),
    index('idx_mns_team_owners_user').on(t.userId),
  ]
)

// ============================================================================
// PLAYERS
// ============================================================================

export const mnsPlayers = pgTable(
  'mns_players',
  {
    id: text('id').primaryKey(),
    fantraxId: text('fantrax_id').notNull().unique(),
    name: text('name').notNull(),
    position: text('position').notNull(),
    salary: bigint('salary', { mode: 'number' }).notNull().default(0),
    teamCode: text('team_code').notNull().default(''),
    leagueId: text('league_id').references(() => mnsLeagues.id, {
      onDelete: 'cascade',
    }),
    teamId: text('team_id').references(() => mnsTeams.id, {
      onDelete: 'set null',
    }),
    sport: text('sport').notNull().default('wnba'),
    slot: text('slot').notNull().default('active'),
    onIR: boolean('on_ir').notNull().default(false),
    isRookie: boolean('is_rookie').notNull().default(false),
    isInternationalStash: boolean('is_international_stash')
      .notNull()
      .default(false),
    intEligible: boolean('int_eligible').notNull().default(false),
    rookieDraftInfo: jsonb('rookie_draft_info').$type<RookieDraftInfo>(),
    keeperPriorYearRound: integer('keeper_prior_year_round'),
    keeperDerivedBaseRound: integer('keeper_derived_base_round'),
    migratedKeeperRound: integer('migrated_keeper_round'),
    migrationSource: text('migration_source').$type<MigrationSource>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_mns_players_league').on(t.leagueId),
    index('idx_mns_players_team').on(t.teamId),
    index('idx_mns_players_league_team').on(t.leagueId, t.teamId),
  ]
)

// ============================================================================
// ROSTERS — keeper decisions
// ============================================================================

export const mnsRosters = pgTable(
  'mns_rosters',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    seasonYear: integer('season_year').notNull(),
    entries: jsonb('entries')
      .$type<RosterEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    summary: jsonb('summary')
      .$type<RosterSummary | Record<string, never>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text('status').notNull().default('draft'),
    savedScenarios: jsonb('saved_scenarios')
      .$type<SavedScenario[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_mns_rosters_league_season').on(t.leagueId, t.seasonYear),
    index('idx_mns_rosters_team').on(t.teamId),
  ]
)

// ============================================================================
// REGULAR-SEASON ROSTERS — active/IR/redshirt slot management
// ============================================================================

export const mnsRegularSeasonRosters = pgTable(
  'mns_regular_season_rosters',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    seasonYear: integer('season_year').notNull(),
    activeRoster: text('active_roster').array().notNull().default(sql`'{}'::text[]`),
    irSlots: text('ir_slots').array().notNull().default(sql`'{}'::text[]`),
    redshirtPlayers: text('redshirt_players').array().notNull().default(sql`'{}'::text[]`),
    internationalPlayers: text('international_players').array().notNull().default(sql`'{}'::text[]`),
    benchedPlayers: text('benched_players').array().notNull().default(sql`'{}'::text[]`),
    isLegalRoster: boolean('is_legal_roster').notNull().default(true),
    lastUpdated: timestamp('last_updated').defaultNow().notNull(),
    updatedBy: text('updated_by'),
  },
  (t) => [
    index('idx_mns_reg_season_rosters_league').on(t.leagueId),
    index('idx_mns_reg_season_rosters_team').on(t.teamId),
  ]
)

// ============================================================================
// DAILY LINEUPS
// ============================================================================

export const mnsDailyLineups = pgTable(
  'mns_daily_lineups',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    gameDate: text('game_date').notNull(),
    activePlayerIds: text('active_player_ids').array().notNull().default(sql`'{}'::text[]`),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    updatedBy: text('updated_by'),
  },
  (t) => [
    index('idx_mns_daily_lineups_team_date').on(t.teamId, t.gameDate),
  ]
)

// ============================================================================
// DRAFT
// ============================================================================

export const mnsDrafts = pgTable(
  'mns_drafts',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    seasonYear: integer('season_year').notNull(),
    status: text('status').notNull().default('setup'),
    draftOrder: text('draft_order').array().notNull().default(sql`'{}'::text[]`),
    currentPick: jsonb('current_pick').$type<DraftCurrentPick | null>(),
    picks: jsonb('picks').$type<DraftPick[]>().notNull().default(sql`'[]'::jsonb`),
    settings: jsonb('settings')
      .$type<DraftSettings>()
      .notNull()
      .default(sql`'{"allowAdminOverride":true,"isTestDraft":false}'::jsonb`),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: text('created_by').notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('idx_mns_drafts_league_season').on(t.leagueId, t.seasonYear)]
)

export const mnsPickAssignments = pgTable(
  'mns_pick_assignments',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    seasonYear: integer('season_year').notNull(),
    round: integer('round').notNull(),
    pickInRound: integer('pick_in_round').notNull(),
    overallPick: integer('overall_pick').notNull(),
    currentTeamId: text('current_team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    originalTeamId: text('original_team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    originalTeamName: text('original_team_name').notNull(),
    originalTeamAbbrev: text('original_team_abbrev').notNull(),
    playerId: text('player_id'),
    playerName: text('player_name'),
    isKeeperSlot: boolean('is_keeper_slot').notNull().default(false),
    pickedAt: timestamp('picked_at'),
    pickedBy: text('picked_by'),
    wasTraded: boolean('was_traded').notNull().default(false),
    tradeHistory: jsonb('trade_history')
      .$type<PickTradeHistoryEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_mns_pick_assignments_league').on(t.leagueId),
    index('idx_mns_pick_assignments_current_team').on(t.currentTeamId),
    index('idx_mns_pick_assignments_league_season').on(t.leagueId, t.seasonYear),
  ]
)

export const mnsRookieDraftPicks = pgTable(
  'mns_rookie_draft_picks',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    seasonYear: integer('season_year').notNull(),
    round: integer('round').notNull(),
    pickInRound: integer('pick_in_round').notNull(),
    overallPick: integer('overall_pick').notNull(),
    teamId: text('team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    playerId: text('player_id'),
    playerName: text('player_name'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_mns_rookie_picks_league').on(t.leagueId),
    index('idx_mns_rookie_picks_team').on(t.teamId),
  ]
)

export const mnsDraftHistory = pgTable(
  'mns_draft_history',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    seasonYear: integer('season_year').notNull(),
    picks: jsonb('picks').$type<DraftPick[]>().notNull().default(sql`'[]'::jsonb`),
    keepers: jsonb('keepers').$type<DraftPick[]>().notNull().default(sql`'[]'::jsonb`),
    redshirtPlayers: text('redshirt_players').array().notNull().default(sql`'{}'::text[]`),
    internationalPlayers: text('international_players').array().notNull().default(sql`'{}'::text[]`),
    completedAt: timestamp('completed_at').notNull(),
    completedBy: text('completed_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_mns_draft_history_league').on(t.leagueId)]
)

// ============================================================================
// SCHEDULE — games, league_weeks, matchups
// ============================================================================

export const mnsGames = pgTable(
  'mns_games',
  {
    id: text('id').primaryKey(),
    seasonYear: integer('season_year').notNull(),
    gameDate: text('game_date').notNull(),
    awayTeam: text('away_team').notNull(),
    homeTeam: text('home_team').notNull(),
    isCupGame: boolean('is_cup_game').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_mns_games_date').on(t.gameDate, t.seasonYear)]
)

export const mnsLeagueWeeks = pgTable(
  'mns_league_weeks',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    seasonYear: integer('season_year').notNull(),
    weekNumber: integer('week_number').notNull(),
    matchupWeek: integer('matchup_week').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    isTradeDeadlineWeek: boolean('is_trade_deadline_week').notNull().default(false),
    label: text('label'),
  },
  (t) => [index('idx_mns_league_weeks_league_season').on(t.leagueId, t.seasonYear)]
)

export const mnsMatchups = pgTable(
  'mns_matchups',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    seasonYear: integer('season_year').notNull(),
    matchupWeek: integer('matchup_week').notNull(),
    homeTeamId: text('home_team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    awayTeamId: text('away_team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    homeScore: numeric('home_score'),
    awayScore: numeric('away_score'),
  },
  (t) => [
    index('idx_mns_matchups_league_week').on(t.leagueId, t.matchupWeek),
  ]
)

// ============================================================================
// FEES
// ============================================================================

export const mnsKeeperFees = pgTable(
  'mns_keeper_fees',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    seasonYear: integer('season_year').notNull(),
    franchiseTagFees: numeric('franchise_tag_fees').notNull().default('0'),
    redshirtFees: numeric('redshirt_fees').notNull().default('0'),
    franchiseTagCount: integer('franchise_tag_count').notNull().default(0),
    redshirtCount: integer('redshirt_count').notNull().default(0),
    lockedAt: timestamp('locked_at').notNull(),
    lockedBy: text('locked_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('idx_mns_keeper_fees_league').on(t.leagueId)]
)

export const mnsTeamFees = pgTable(
  'mns_team_fees',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    seasonYear: integer('season_year').notNull(),
    franchiseTagFees: numeric('franchise_tag_fees').notNull().default('0'),
    redshirtFees: numeric('redshirt_fees').notNull().default('0'),
    firstApronFee: numeric('first_apron_fee').notNull().default('0'),
    secondApronPenalty: numeric('second_apron_penalty').notNull().default('0'),
    unredshirtFees: numeric('unredshirt_fees').notNull().default('0'),
    feesLocked: boolean('fees_locked').notNull().default(false),
    lockedAt: timestamp('locked_at'),
    feeTransactions: jsonb('fee_transactions').notNull().default(sql`'[]'::jsonb`),
    totalFees: numeric('total_fees').notNull().default('0'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_mns_team_fees_league').on(t.leagueId),
    index('idx_mns_team_fees_team').on(t.teamId),
  ]
)

// ============================================================================
// TRADES
// ============================================================================

export const mnsTradeProposals = pgTable(
  'mns_trade_proposals',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    seasonYear: integer('season_year').notNull(),
    proposedByTeamId: text('proposed_by_team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    proposedByUserId: text('proposed_by_user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('pending'),
    assets: jsonb('assets').$type<TradeAsset[]>().notNull().default(sql`'[]'::jsonb`),
    involvedTeamIds: text('involved_team_ids').array().notNull().default(sql`'{}'::text[]`),
    note: text('note'),
    expiresAt: timestamp('expires_at'),
    executedAt: timestamp('executed_at'),
    executedBy: text('executed_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_mns_trade_proposals_league').on(t.leagueId),
    index('idx_mns_trade_proposals_status').on(t.status),
  ]
)

export const mnsTradeProposalResponses = pgTable(
  'mns_trade_proposal_responses',
  {
    id: text('id').primaryKey(),
    proposalId: text('proposal_id')
      .notNull()
      .references(() => mnsTradeProposals.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    respondedBy: text('responded_by'),
    respondedAt: timestamp('responded_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_mns_trade_responses_proposal').on(t.proposalId),
    index('idx_mns_trade_responses_team').on(t.teamId),
  ]
)

// ============================================================================
// WAGERS
// ============================================================================

export const mnsWagers = pgTable(
  'mns_wagers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    seasonYear: integer('season_year').notNull(),
    proposerTeamId: text('proposer_team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    opponentTeamId: text('opponent_team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    amount: numeric('amount').notNull(),
    settlementDate: text('settlement_date'),
    status: text('status').notNull().default('pending'),
    proposedAt: timestamp('proposed_at').defaultNow().notNull(),
    proposedBy: text('proposed_by').notNull(),
    respondedAt: timestamp('responded_at'),
    respondedBy: text('responded_by'),
    settledAt: timestamp('settled_at'),
    winnerTeamId: text('winner_team_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_mns_wagers_league').on(t.leagueId),
    index('idx_mns_wagers_proposer').on(t.proposerTeamId),
    index('idx_mns_wagers_opponent').on(t.opponentTeamId),
  ]
)

// ============================================================================
// WATCHLISTS
// ============================================================================

export const mnsWatchlists = pgTable(
  'mns_watchlists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => mnsTeams.id, { onDelete: 'cascade' }),
    playerIds: text('player_ids').array().notNull().default(sql`'{}'::text[]`),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_mns_watchlists_league_team').on(t.leagueId, t.teamId)]
)

// ============================================================================
// STATS
// ============================================================================

export const mnsProjectedStats = pgTable('mns_projected_stats', {
  fantraxId: text('fantrax_id').primaryKey(),
  name: text('name').notNull(),
  teamCode: text('team_code').notNull().default(''),
  position: text('position').notNull().default(''),
  rkOv: integer('rk_ov'),
  age: integer('age'),
  salary: bigint('salary', { mode: 'number' }),
  score: numeric('score', { precision: 8, scale: 2 }),
  adp: numeric('adp', { precision: 8, scale: 2 }),
  fgPercent: numeric('fg_percent', { precision: 5, scale: 3 }),
  threePointMade: numeric('three_point_made', { precision: 6, scale: 2 }),
  ftPercent: numeric('ft_percent', { precision: 5, scale: 3 }),
  points: numeric('points', { precision: 6, scale: 2 }),
  rebounds: numeric('rebounds', { precision: 6, scale: 2 }),
  assists: numeric('assists', { precision: 6, scale: 2 }),
  steals: numeric('steals', { precision: 6, scale: 2 }),
  blocks: numeric('blocks', { precision: 6, scale: 2 }),
  assistToTurnover: numeric('assist_to_turnover', { precision: 6, scale: 2 }),
  salaryScore: numeric('salary_score', { precision: 8, scale: 2 }),
  seasonYear: text('season_year').notNull().default('2025-26'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const mnsPreviousStats = pgTable('mns_previous_stats', {
  fantraxId: text('fantrax_id').primaryKey(),
  name: text('name').notNull(),
  teamCode: text('team_code').notNull().default(''),
  position: text('position').notNull().default(''),
  fgPercent: numeric('fg_percent', { precision: 5, scale: 3 }),
  threePointMade: numeric('three_point_made', { precision: 6, scale: 2 }),
  ftPercent: numeric('ft_percent', { precision: 5, scale: 3 }),
  points: numeric('points', { precision: 6, scale: 2 }),
  rebounds: numeric('rebounds', { precision: 6, scale: 2 }),
  assists: numeric('assists', { precision: 6, scale: 2 }),
  steals: numeric('steals', { precision: 6, scale: 2 }),
  blocks: numeric('blocks', { precision: 6, scale: 2 }),
  assistToTurnover: numeric('assist_to_turnover', { precision: 6, scale: 2 }),
  seasonYear: text('season_year').notNull().default('2024-25'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ============================================================================
// PROSPECTS
// ============================================================================

export const mnsProspects = pgTable(
  'mns_prospects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rank: integer('rank').notNull(),
    player: text('player').notNull(),
    school: text('school').notNull().default(''),
    year: text('year').notNull().default(''),
    position: text('position').notNull().default(''),
    positionRank: integer('position_rank'),
    height: text('height'),
    weight: integer('weight'),
    age: integer('age'),
    hometown: text('hometown'),
    highSchool: text('high_school'),
    draftYear: integer('draft_year'),
    draftProjection: text('draft_projection'),
    scoutingReport: text('scouting_report'),
    strengths: text('strengths').array(),
    weaknesses: text('weaknesses').array(),
    playerComparison: text('player_comparison'),
    sport: text('sport').notNull().default('wnba'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('idx_mns_prospects_rank').on(t.rank)]
)

// ============================================================================
// PORTFOLIO — prize pool wallet tracking
// ============================================================================

export const mnsPortfolios = pgTable(
  'mns_portfolios',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    walletAddress: text('wallet_address').notNull(),
    usdInvested: numeric('usd_invested').notNull().default('0'),
    cachedEthBalance: numeric('cached_eth_balance'),
    cachedUsdValue: numeric('cached_usd_value'),
    cachedEthPrice: numeric('cached_eth_price'),
    lastUpdated: timestamp('last_updated').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('idx_mns_portfolios_league').on(t.leagueId)]
)

// ============================================================================
// PLAYOFFS
// ============================================================================

export const mnsPlayoffBrackets = pgTable(
  'mns_playoff_brackets',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    seasonYear: integer('season_year').notNull(),
    bracket: jsonb('bracket').notNull(),
    consolation: jsonb('consolation'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('idx_mns_playoff_brackets_league').on(t.leagueId)]
)

export const mnsPrizePayouts = pgTable(
  'mns_prize_payouts',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    seasonYear: integer('season_year').notNull(),
    zone: text('zone').notNull(),
    totalPool: numeric('total_pool').notNull(),
    payouts: jsonb('payouts').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_mns_prize_payouts_league').on(t.leagueId)]
)

// ============================================================================
// AUDIT — importer log + phase transitions
// ============================================================================

export const mnsLeagueImports = pgTable(
  'mns_league_imports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    importer: text('importer').notNull(),
    ranBy: text('ran_by').notNull().references(() => users.id),
    ranAt: timestamp('ran_at').defaultNow().notNull(),
    fileHash: text('file_hash'),
    resultSummary: jsonb('result_summary'),
  },
  (t) => [index('idx_mns_league_imports_league').on(t.leagueId)]
)

export const mnsPhaseTransitions = pgTable(
  'mns_phase_transitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => mnsLeagues.id, { onDelete: 'cascade' }),
    fromPhase: text('from_phase').$type<LeaguePhase>(),
    toPhase: text('to_phase').$type<LeaguePhase>().notNull(),
    triggeredBy: text('triggered_by').notNull().references(() => users.id),
    triggeredAt: timestamp('triggered_at').defaultNow().notNull(),
    preconditionsMet: jsonb('preconditions_met'),
  },
  (t) => [index('idx_mns_phase_transitions_league').on(t.leagueId)]
)
