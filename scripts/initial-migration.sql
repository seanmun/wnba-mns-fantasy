-- Initial MNS keeper-league schema migration. Hand-curated from drizzle-
-- kit push output to apply ONLY additive changes against the shared
-- Neon DB.
--
-- Architecture note: tables are prefixed `mns_` because they describe
-- the MNS keeper-league game family. NBA and WNBA share the same
-- tables, discriminated by mns_leagues.sport ('wnba' | 'nba'). Adding
-- the NBA app later is a config addition, not a schema duplication.
--
-- Specifically EXCLUDED from this migration (drizzle suggested them
-- but they belong to other game families in the shared DB):
--   - DROP INDEX "users_email_key"         (owned by ncaa-mns-fantasy)
--   - DROP SEQUENCE "leaderboard_id_seq"   (owned by golf-mns-fantasy)
--   - ALTER COLUMN type changes on users   (NCAA owns column types)
--   - ALTER COLUMN SET NOT NULL on users   (could fail on existing rows)
--
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS); the
-- Node script applying this also tolerates duplicate-constraint errors.

-- ============================================================================
-- 1. Extend shared `users` table with role + updated_at
-- ============================================================================

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'owner' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;

-- ============================================================================
-- 2. Create all mns_* tables (CREATE TABLE IF NOT EXISTS for idempotency)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "mns_daily_lineups" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"team_id" text NOT NULL,
	"game_date" text NOT NULL,
	"active_player_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
CREATE TABLE IF NOT EXISTS "mns_draft_history" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"picks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"keepers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"redshirt_players" text[] DEFAULT '{}'::text[] NOT NULL,
	"international_players" text[] DEFAULT '{}'::text[] NOT NULL,
	"completed_at" timestamp NOT NULL,
	"completed_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"status" text DEFAULT 'setup' NOT NULL,
	"draft_order" text[] DEFAULT '{}'::text[] NOT NULL,
	"current_pick" jsonb,
	"picks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{"allowAdminOverride":true,"isTestDraft":false}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_games" (
	"id" text PRIMARY KEY NOT NULL,
	"season_year" integer NOT NULL,
	"game_date" text NOT NULL,
	"away_team" text NOT NULL,
	"home_team" text NOT NULL,
	"is_cup_game" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_keeper_fees" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"team_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"franchise_tag_fees" numeric DEFAULT '0' NOT NULL,
	"redshirt_fees" numeric DEFAULT '0' NOT NULL,
	"franchise_tag_count" integer DEFAULT 0 NOT NULL,
	"redshirt_count" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp NOT NULL,
	"locked_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_league_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" text NOT NULL,
	"importer" text NOT NULL,
	"ran_by" text NOT NULL,
	"ran_at" timestamp DEFAULT now() NOT NULL,
	"file_hash" text,
	"result_summary" jsonb
);
CREATE TABLE IF NOT EXISTS "mns_league_weeks" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"week_number" integer NOT NULL,
	"matchup_week" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"is_trade_deadline_week" boolean DEFAULT false NOT NULL,
	"label" text
);
CREATE TABLE IF NOT EXISTS "mns_leagues" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"season_year" integer NOT NULL,
	"sport" text NOT NULL,
	"game_slug" text NOT NULL,
	"config" jsonb NOT NULL,
	"league_phase" text DEFAULT 'keeper_season' NOT NULL,
	"keepers_locked" boolean DEFAULT false NOT NULL,
	"commissioner_id" text,
	"scoring_mode" text DEFAULT 'category_record' NOT NULL,
	"season_started_at" timestamp,
	"season_started_by" text,
	"telegram_chat_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_matchups" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"matchup_week" integer NOT NULL,
	"home_team_id" text NOT NULL,
	"away_team_id" text NOT NULL,
	"home_score" numeric,
	"away_score" numeric
);
CREATE TABLE IF NOT EXISTS "mns_phase_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" text NOT NULL,
	"from_phase" text,
	"to_phase" text NOT NULL,
	"triggered_by" text NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"preconditions_met" jsonb
);
CREATE TABLE IF NOT EXISTS "mns_pick_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"round" integer NOT NULL,
	"pick_in_round" integer NOT NULL,
	"overall_pick" integer NOT NULL,
	"current_team_id" text NOT NULL,
	"original_team_id" text NOT NULL,
	"original_team_name" text NOT NULL,
	"original_team_abbrev" text NOT NULL,
	"player_id" text,
	"player_name" text,
	"is_keeper_slot" boolean DEFAULT false NOT NULL,
	"picked_at" timestamp,
	"picked_by" text,
	"was_traded" boolean DEFAULT false NOT NULL,
	"trade_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_players" (
	"id" text PRIMARY KEY NOT NULL,
	"fantrax_id" text NOT NULL,
	"name" text NOT NULL,
	"position" text NOT NULL,
	"salary" bigint DEFAULT 0 NOT NULL,
	"team_code" text DEFAULT '' NOT NULL,
	"league_id" text,
	"team_id" text,
	"sport" text DEFAULT 'wnba' NOT NULL,
	"slot" text DEFAULT 'active' NOT NULL,
	"on_ir" boolean DEFAULT false NOT NULL,
	"is_rookie" boolean DEFAULT false NOT NULL,
	"is_international_stash" boolean DEFAULT false NOT NULL,
	"int_eligible" boolean DEFAULT false NOT NULL,
	"rookie_draft_info" jsonb,
	"keeper_prior_year_round" integer,
	"keeper_derived_base_round" integer,
	"migrated_keeper_round" integer,
	"migration_source" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mns_players_fantrax_id_unique" UNIQUE("fantrax_id")
);
CREATE TABLE IF NOT EXISTS "mns_playoff_brackets" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"bracket" jsonb NOT NULL,
	"consolation" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_portfolios" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"usd_invested" numeric DEFAULT '0' NOT NULL,
	"cached_eth_balance" numeric,
	"cached_usd_value" numeric,
	"cached_eth_price" numeric,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_previous_stats" (
	"fantrax_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"team_code" text DEFAULT '' NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"fg_percent" numeric(5, 3),
	"three_point_made" numeric(6, 2),
	"ft_percent" numeric(5, 3),
	"points" numeric(6, 2),
	"rebounds" numeric(6, 2),
	"assists" numeric(6, 2),
	"steals" numeric(6, 2),
	"blocks" numeric(6, 2),
	"assist_to_turnover" numeric(6, 2),
	"season_year" text DEFAULT '2024-25' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_prize_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"zone" text NOT NULL,
	"total_pool" numeric NOT NULL,
	"payouts" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_projected_stats" (
	"fantrax_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"team_code" text DEFAULT '' NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"rk_ov" integer,
	"age" integer,
	"salary" bigint,
	"score" numeric(8, 2),
	"adp" numeric(8, 2),
	"fg_percent" numeric(5, 3),
	"three_point_made" numeric(6, 2),
	"ft_percent" numeric(5, 3),
	"points" numeric(6, 2),
	"rebounds" numeric(6, 2),
	"assists" numeric(6, 2),
	"steals" numeric(6, 2),
	"blocks" numeric(6, 2),
	"assist_to_turnover" numeric(6, 2),
	"salary_score" numeric(8, 2),
	"season_year" text DEFAULT '2025-26' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rank" integer NOT NULL,
	"player" text NOT NULL,
	"school" text DEFAULT '' NOT NULL,
	"year" text DEFAULT '' NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"position_rank" integer,
	"height" text,
	"weight" integer,
	"age" integer,
	"hometown" text,
	"high_school" text,
	"draft_year" integer,
	"draft_projection" text,
	"scouting_report" text,
	"strengths" text[],
	"weaknesses" text[],
	"player_comparison" text,
	"sport" text DEFAULT 'wnba' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_regular_season_rosters" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"team_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"active_roster" text[] DEFAULT '{}'::text[] NOT NULL,
	"ir_slots" text[] DEFAULT '{}'::text[] NOT NULL,
	"redshirt_players" text[] DEFAULT '{}'::text[] NOT NULL,
	"international_players" text[] DEFAULT '{}'::text[] NOT NULL,
	"benched_players" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_legal_roster" boolean DEFAULT true NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
CREATE TABLE IF NOT EXISTS "mns_rookie_draft_picks" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"round" integer NOT NULL,
	"pick_in_round" integer NOT NULL,
	"overall_pick" integer NOT NULL,
	"team_id" text NOT NULL,
	"player_id" text,
	"player_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_rosters" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"team_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"saved_scenarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_team_fees" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"team_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"franchise_tag_fees" numeric DEFAULT '0' NOT NULL,
	"redshirt_fees" numeric DEFAULT '0' NOT NULL,
	"first_apron_fee" numeric DEFAULT '0' NOT NULL,
	"second_apron_penalty" numeric DEFAULT '0' NOT NULL,
	"unredshirt_fees" numeric DEFAULT '0' NOT NULL,
	"fees_locked" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp,
	"fee_transactions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_fees" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_team_owners" (
	"team_id" text NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"display_name" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mns_team_owners_team_id_email_pk" PRIMARY KEY("team_id","email")
);
CREATE TABLE IF NOT EXISTS "mns_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"name" text NOT NULL,
	"abbrev" text NOT NULL,
	"telegram_username" text,
	"cap_adjustments" jsonb DEFAULT '{"tradeDelta":0}'::jsonb NOT NULL,
	"banners" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_trade_proposal_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"team_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"responded_by" text,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_trade_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"proposed_by_team_id" text NOT NULL,
	"proposed_by_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"assets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"involved_team_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"note" text,
	"expires_at" timestamp,
	"executed_at" timestamp,
	"executed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_wagers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"proposer_team_id" text NOT NULL,
	"opponent_team_id" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric NOT NULL,
	"settlement_date" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"proposed_at" timestamp DEFAULT now() NOT NULL,
	"proposed_by" text NOT NULL,
	"responded_at" timestamp,
	"responded_by" text,
	"settled_at" timestamp,
	"winner_team_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "mns_watchlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" text NOT NULL,
	"team_id" text NOT NULL,
	"player_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- =========================================
-- 3. Foreign key constraints
-- =========================================
ALTER TABLE "mns_daily_lineups" ADD CONSTRAINT "mns_daily_lineups_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_daily_lineups" ADD CONSTRAINT "mns_daily_lineups_team_id_mns_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_draft_history" ADD CONSTRAINT "mns_draft_history_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_drafts" ADD CONSTRAINT "mns_drafts_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_keeper_fees" ADD CONSTRAINT "mns_keeper_fees_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_keeper_fees" ADD CONSTRAINT "mns_keeper_fees_team_id_mns_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_league_imports" ADD CONSTRAINT "mns_league_imports_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_league_imports" ADD CONSTRAINT "mns_league_imports_ran_by_users_id_fk" FOREIGN KEY ("ran_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mns_league_weeks" ADD CONSTRAINT "mns_league_weeks_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_leagues" ADD CONSTRAINT "mns_leagues_commissioner_id_users_id_fk" FOREIGN KEY ("commissioner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mns_matchups" ADD CONSTRAINT "mns_matchups_away_team_id_mns_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_matchups" ADD CONSTRAINT "mns_matchups_home_team_id_mns_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_matchups" ADD CONSTRAINT "mns_matchups_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_phase_transitions" ADD CONSTRAINT "mns_phase_transitions_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_phase_transitions" ADD CONSTRAINT "mns_phase_transitions_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mns_pick_assignments" ADD CONSTRAINT "mns_pick_assignments_current_team_id_mns_teams_id_fk" FOREIGN KEY ("current_team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_pick_assignments" ADD CONSTRAINT "mns_pick_assignments_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_pick_assignments" ADD CONSTRAINT "mns_pick_assignments_original_team_id_mns_teams_id_fk" FOREIGN KEY ("original_team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_players" ADD CONSTRAINT "mns_players_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_players" ADD CONSTRAINT "mns_players_team_id_mns_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mns_teams"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "mns_playoff_brackets" ADD CONSTRAINT "mns_playoff_brackets_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_portfolios" ADD CONSTRAINT "mns_portfolios_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_prize_payouts" ADD CONSTRAINT "mns_prize_payouts_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_regular_season_rosters" ADD CONSTRAINT "mns_regular_season_rosters_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_regular_season_rosters" ADD CONSTRAINT "mns_regular_season_rosters_team_id_mns_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_rookie_draft_picks" ADD CONSTRAINT "mns_rookie_draft_picks_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_rookie_draft_picks" ADD CONSTRAINT "mns_rookie_draft_picks_team_id_mns_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_rosters" ADD CONSTRAINT "mns_rosters_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_rosters" ADD CONSTRAINT "mns_rosters_team_id_mns_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_team_fees" ADD CONSTRAINT "mns_team_fees_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_team_fees" ADD CONSTRAINT "mns_team_fees_team_id_mns_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_team_owners" ADD CONSTRAINT "mns_team_owners_team_id_mns_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_team_owners" ADD CONSTRAINT "mns_team_owners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "mns_teams" ADD CONSTRAINT "mns_teams_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_trade_proposal_responses" ADD CONSTRAINT "mns_trade_proposal_responses_proposal_id_mns_trade_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."mns_trade_proposals"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_trade_proposal_responses" ADD CONSTRAINT "mns_trade_proposal_responses_team_id_mns_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_trade_proposals" ADD CONSTRAINT "mns_trade_proposals_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_trade_proposals" ADD CONSTRAINT "mns_trade_proposals_proposed_by_team_id_mns_teams_id_fk" FOREIGN KEY ("proposed_by_team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_trade_proposals" ADD CONSTRAINT "mns_trade_proposals_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "mns_wagers" ADD CONSTRAINT "mns_wagers_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_wagers" ADD CONSTRAINT "mns_wagers_opponent_team_id_mns_teams_id_fk" FOREIGN KEY ("opponent_team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_wagers" ADD CONSTRAINT "mns_wagers_proposer_team_id_mns_teams_id_fk" FOREIGN KEY ("proposer_team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_watchlists" ADD CONSTRAINT "mns_watchlists_league_id_mns_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."mns_leagues"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mns_watchlists" ADD CONSTRAINT "mns_watchlists_team_id_mns_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mns_teams"("id") ON DELETE cascade ON UPDATE no action;

-- =========================================
-- 4. Indexes (CREATE INDEX IF NOT EXISTS)
-- =========================================
CREATE INDEX IF NOT EXISTS "idx_mns_daily_lineups_team_date" ON "mns_daily_lineups" USING btree ("team_id","game_date");
CREATE INDEX IF NOT EXISTS "idx_mns_draft_history_league" ON "mns_draft_history" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_drafts_league_season" ON "mns_drafts" USING btree ("league_id","season_year");
CREATE INDEX IF NOT EXISTS "idx_mns_games_date" ON "mns_games" USING btree ("game_date","season_year");
CREATE INDEX IF NOT EXISTS "idx_mns_keeper_fees_league" ON "mns_keeper_fees" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_league_imports_league" ON "mns_league_imports" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_league_weeks_league_season" ON "mns_league_weeks" USING btree ("league_id","season_year");
CREATE INDEX IF NOT EXISTS "idx_mns_leagues_commissioner" ON "mns_leagues" USING btree ("commissioner_id");
CREATE INDEX IF NOT EXISTS "idx_mns_leagues_game_slug" ON "mns_leagues" USING btree ("game_slug");
CREATE INDEX IF NOT EXISTS "idx_mns_leagues_sport_season" ON "mns_leagues" USING btree ("sport","season_year");
CREATE INDEX IF NOT EXISTS "idx_mns_matchups_league_week" ON "mns_matchups" USING btree ("league_id","matchup_week");
CREATE INDEX IF NOT EXISTS "idx_mns_phase_transitions_league" ON "mns_phase_transitions" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_pick_assignments_current_team" ON "mns_pick_assignments" USING btree ("current_team_id");
CREATE INDEX IF NOT EXISTS "idx_mns_pick_assignments_league" ON "mns_pick_assignments" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_pick_assignments_league_season" ON "mns_pick_assignments" USING btree ("league_id","season_year");
CREATE INDEX IF NOT EXISTS "idx_mns_players_league" ON "mns_players" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_players_league_team" ON "mns_players" USING btree ("league_id","team_id");
CREATE INDEX IF NOT EXISTS "idx_mns_players_team" ON "mns_players" USING btree ("team_id");
CREATE INDEX IF NOT EXISTS "idx_mns_playoff_brackets_league" ON "mns_playoff_brackets" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_portfolios_league" ON "mns_portfolios" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_prize_payouts_league" ON "mns_prize_payouts" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_prospects_rank" ON "mns_prospects" USING btree ("rank");
CREATE INDEX IF NOT EXISTS "idx_mns_reg_season_rosters_league" ON "mns_regular_season_rosters" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_reg_season_rosters_team" ON "mns_regular_season_rosters" USING btree ("team_id");
CREATE INDEX IF NOT EXISTS "idx_mns_rookie_picks_league" ON "mns_rookie_draft_picks" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_rookie_picks_team" ON "mns_rookie_draft_picks" USING btree ("team_id");
CREATE INDEX IF NOT EXISTS "idx_mns_rosters_league_season" ON "mns_rosters" USING btree ("league_id","season_year");
CREATE INDEX IF NOT EXISTS "idx_mns_rosters_team" ON "mns_rosters" USING btree ("team_id");
CREATE INDEX IF NOT EXISTS "idx_mns_team_fees_league" ON "mns_team_fees" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_team_fees_team" ON "mns_team_fees" USING btree ("team_id");
CREATE INDEX IF NOT EXISTS "idx_mns_team_owners_email" ON "mns_team_owners" USING btree ("email");
CREATE INDEX IF NOT EXISTS "idx_mns_team_owners_user" ON "mns_team_owners" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idx_mns_teams_league" ON "mns_teams" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_trade_proposals_league" ON "mns_trade_proposals" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_trade_proposals_status" ON "mns_trade_proposals" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_mns_trade_responses_proposal" ON "mns_trade_proposal_responses" USING btree ("proposal_id");
CREATE INDEX IF NOT EXISTS "idx_mns_trade_responses_team" ON "mns_trade_proposal_responses" USING btree ("team_id");
CREATE INDEX IF NOT EXISTS "idx_mns_wagers_league" ON "mns_wagers" USING btree ("league_id");
CREATE INDEX IF NOT EXISTS "idx_mns_wagers_opponent" ON "mns_wagers" USING btree ("opponent_team_id");
CREATE INDEX IF NOT EXISTS "idx_mns_wagers_proposer" ON "mns_wagers" USING btree ("proposer_team_id");
CREATE INDEX IF NOT EXISTS "idx_mns_watchlists_league_team" ON "mns_watchlists" USING btree ("league_id","team_id");
