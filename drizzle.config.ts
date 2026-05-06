import type { Config } from 'drizzle-kit'

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Limit introspection to WNBA tables and the cross-game shared tables we touch.
  // Prevents accidental migrations against ncaa_*, golf_*, etc.
  tablesFilter: ['wnba_*', 'users', 'marketing_*', 'email_templates'],
  verbose: true,
  strict: true,
} satisfies Config
