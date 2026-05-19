import { config as loadEnv } from 'dotenv'
import type { Config } from 'drizzle-kit'

// Read .env.local first (Vite convention for local overrides), then
// fall back to .env. Drizzle-kit doesn't autoload either.
loadEnv({ path: '.env.local' })
loadEnv()

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Limit introspection strictly to tables we own. The `users` table is
  // shared cross-game (NCAA/golf) but we extend it with a `role` column;
  // diff will be additive only. Do NOT add other shared tables here unless
  // we also define them in schema.ts — drizzle would otherwise want to DROP
  // anything in DB but not in our schema.
  tablesFilter: ['mns_*', 'users'],
  verbose: true,
  strict: true,
} satisfies Config
