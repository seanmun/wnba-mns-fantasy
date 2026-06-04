#!/usr/bin/env node
// One-shot migration: replace fantrax_id with external_ids on mns_players,
// and switch mns_projected_stats + mns_previous_stats to key by player_id.
//
// Safe because the new mns_* tables have no rows yet (we just stood them
// up). For the stats tables: DROP + CREATE since there's nothing to keep.
//
// Usage:  node scripts/migrate-external-ids.mjs

import { config as loadEnv } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: join(__dirname, '..', '.env.local') })
loadEnv({ path: join(__dirname, '..', '.env') })

const sql = neon(process.env.DATABASE_URL)

const statements = [
  // 1. mns_players: drop fantrax_id constraint + column, add external_ids
  `ALTER TABLE mns_players DROP CONSTRAINT IF EXISTS mns_players_fantrax_id_unique`,
  `ALTER TABLE mns_players DROP COLUMN IF EXISTS fantrax_id`,
  `ALTER TABLE mns_players ADD COLUMN IF NOT EXISTS external_ids jsonb NOT NULL DEFAULT '{}'::jsonb`,

  // 2. Stats tables: drop and recreate keyed by player_id
  `DROP TABLE IF EXISTS mns_projected_stats CASCADE`,
  `DROP TABLE IF EXISTS mns_previous_stats CASCADE`,

  `CREATE TABLE mns_projected_stats (
    player_id text NOT NULL REFERENCES mns_players(id) ON DELETE CASCADE,
    season_year text NOT NULL DEFAULT '2025-26',
    name text NOT NULL,
    team_code text NOT NULL DEFAULT '',
    position text NOT NULL DEFAULT '',
    rk_ov integer,
    age integer,
    salary bigint,
    score numeric(8,2),
    adp numeric(8,2),
    fg_percent numeric(5,3),
    three_point_made numeric(6,2),
    ft_percent numeric(5,3),
    points numeric(6,2),
    rebounds numeric(6,2),
    assists numeric(6,2),
    steals numeric(6,2),
    blocks numeric(6,2),
    assist_to_turnover numeric(6,2),
    salary_score numeric(8,2),
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, season_year)
  )`,

  `CREATE TABLE mns_previous_stats (
    player_id text NOT NULL REFERENCES mns_players(id) ON DELETE CASCADE,
    season_year text NOT NULL DEFAULT '2024-25',
    name text NOT NULL,
    team_code text NOT NULL DEFAULT '',
    position text NOT NULL DEFAULT '',
    fg_percent numeric(5,3),
    three_point_made numeric(6,2),
    ft_percent numeric(5,3),
    points numeric(6,2),
    rebounds numeric(6,2),
    assists numeric(6,2),
    steals numeric(6,2),
    blocks numeric(6,2),
    assist_to_turnover numeric(6,2),
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, season_year)
  )`,
]

let applied = 0
let failed = 0
for (const stmt of statements) {
  const preview = stmt.replace(/\s+/g, ' ').slice(0, 100)
  try {
    await sql.query(stmt)
    applied++
    console.log(`✓ ${preview}`)
  } catch (err) {
    failed++
    console.error(`✗ ${preview}`)
    console.error(`  ${err instanceof Error ? err.message : err}`)
  }
}
console.log(`\nApplied: ${applied}, Failed: ${failed}`)
process.exit(failed > 0 ? 1 : 0)
