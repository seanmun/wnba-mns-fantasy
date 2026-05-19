#!/usr/bin/env node
// One-shot script to apply scripts/initial-migration.sql against the
// shared Neon DB. Per-statement error tolerance: continues past
// "already exists" / "duplicate" errors so the script is re-runnable.
//
// Usage:  node scripts/apply-initial-migration.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { neon } from '@neondatabase/serverless'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

loadEnv({ path: join(repoRoot, '.env.local') })
loadEnv({ path: join(repoRoot, '.env') })

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL not set (looked in .env.local and .env)')
  process.exit(1)
}

const sql = neon(dbUrl)
const ddl = readFileSync(join(__dirname, 'initial-migration.sql'), 'utf-8')

const statements = ddl
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !/^(--.*)$/.test(s))
  .map((s) => (s.endsWith(';') ? s : s + ';'))

let applied = 0
let skipped = 0
let failed = 0

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i]
  const preview = stmt.replace(/\s+/g, ' ').slice(0, 80)
  try {
    await sql.query(stmt)
    applied++
    console.log(`✓ [${i + 1}/${statements.length}] ${preview}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (
      msg.includes('already exists') ||
      msg.includes('duplicate') ||
      msg.match(/column .* of relation .* already exists/i)
    ) {
      skipped++
      console.log(`↻ [${i + 1}/${statements.length}] (already exists) ${preview}`)
    } else {
      failed++
      console.error(`✗ [${i + 1}/${statements.length}] ${preview}`)
      console.error(`   ${msg}`)
    }
  }
}

console.log('')
console.log(`Applied: ${applied}, Skipped (already exists): ${skipped}, Failed: ${failed}`)
process.exit(failed > 0 ? 1 : 0)
