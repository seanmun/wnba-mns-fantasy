# SCAFFOLD_PLAN.md — `wnba-mns-fantasy/`

> Read-only scaffold spec. Approve before any files are created.
> Companion to [REFACTOR_PLAN.md](REFACTOR_PLAN.md) (the plan) and [FEATURES.md](FEATURES.md) (the contract).
>
> When the user approves, this plan becomes the file-by-file blueprint for creating `wnba-mns-fantasy/`. Phase 0 of the build.

---

## 1. Pre-scaffold checklist (manual steps for the user)

These happen outside the code. List them once now so we don't get blocked mid-scaffold.

### 1a. Clerk dashboard
1. Open the existing `mnsfantasy.com` Clerk application (the one used by `ncaa-mns-fantasy` and `mns-fantasy`).
2. **Allowed origins** → add `https://wnba.mnsfantasy.com` (and `http://localhost:5173` if not already there for dev).
3. Verify cookie scope is `.mnsfantasy.com` (default — should already be set by the parent app).
4. **No new Clerk app needed.** Same publishable + secret keys as siblings.

### 1b. Neon database
1. Open the existing shared Neon project (the one `ncaa-mns-fantasy` and `mns-fantasy` connect to).
2. **No new project, no new database.** WNBA tables join the existing `neondb` namespaced via `wnba_` prefix.
3. Capture the existing `DATABASE_URL` from your password manager (matches what NCAA app uses).

### 1c. Vercel
1. Create new Vercel project named `wnba-mns-fantasy` (no GitHub link yet — local first).
2. Plan to assign domain `wnba.mnsfantasy.com` after first deploy.
3. Inherit existing env vars from `ncaa-mns-fantasy` for shared secrets (Clerk keys, `DATABASE_URL`); add WNBA-specific ones.

### 1d. DNS (in your domain registrar)
1. Add CNAME `wnba.mnsfantasy.com` → Vercel project's domain (will be provided after Vercel project create).
2. Verify cookie scope works by testing sign-in flow once deployed.

### 1e. Decisions to lock before scaffold
Quick answers — none are commitments.

| # | Question | Default if unanswered |
|---|---|---|
| 1 | Folder name? | `wnba-mns-fantasy/` (confirmed) |
| 2 | Branding/assets — copy from `mns/` or fresh? | **Copy from `mns/`** (logos, hinkie, prize pool images, video) |
| 3 | Package manager — npm, pnpm, or bun? | **npm** (matches sibling apps) |
| 4 | Site-admin role — env var CSV or `users.role` column? | **`users.role` column** (promotable without redeploy) |
| 5 | Email templates — shared `email_templates` table or `wnba_email_templates`? | **Shared, namespaced names** (e.g., `wnba_keeper_locked`) |
| 6 | Multi-commissioner — single column or join table? | **Single column for v1, join table later if needed** |
| 7 | Mock draft persistence — ephemeral or saved? | **Ephemeral** |
| 8 | Stats source for WNBA — keep Her Hoop Stats scraper as-is? | **Yes, port verbatim** |

If any of these need different answers, raise before scaffold runs.

---

## 2. Folder tree (every file to create)

```
wnba-mns-fantasy/
├── .env.example
├── .gitignore
├── .nvmrc                                  Node 20
├── README.md
├── FEATURES.md                             moved from mns/
├── REFACTOR_PLAN.md                        moved from mns/
├── SCAFFOLD_PLAN.md                        moved from mns/ (this file)
├── package.json
├── package-lock.json                       generated
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── eslint.config.js
├── postcss.config.js
├── tailwind.config.js
├── vite.config.ts
├── vitest.config.ts
├── drizzle.config.ts
├── vercel.json
├── index.html
│
├── api/
│   ├── _db.ts
│   ├── _middleware.ts
│   ├── _validation.ts
│   ├── _rateLimit.ts
│   ├── _logger.ts
│   ├── health.ts                           sanity endpoint
│   ├── users/
│   │   └── sync.ts
│   ├── leagues/
│   │   ├── index.ts
│   │   ├── [id].ts
│   │   ├── [id]/teams.ts
│   │   ├── [id]/teams/[teamId].ts
│   │   ├── [id]/teams/[teamId]/owners.ts
│   │   ├── [id]/players.ts
│   │   ├── [id]/players/[playerId].ts
│   │   ├── [id]/rosters.ts
│   │   ├── [id]/rosters/[teamId].ts
│   │   ├── [id]/rosters/[teamId]/scenarios.ts
│   │   ├── [id]/rosters/[teamId]/submit.ts
│   │   ├── [id]/season-rosters.ts
│   │   ├── [id]/season-rosters/[teamId].ts
│   │   ├── [id]/daily-lineups.ts
│   │   ├── [id]/draft.ts
│   │   ├── [id]/draft/setup.ts
│   │   ├── [id]/draft/pick.ts
│   │   ├── [id]/draft/undo.ts
│   │   ├── [id]/draft/complete.ts
│   │   ├── [id]/pick-assignments.ts
│   │   ├── [id]/rookie-picks.ts
│   │   ├── [id]/draft-history.ts
│   │   ├── [id]/games.ts
│   │   ├── [id]/league-weeks.ts
│   │   ├── [id]/matchups.ts
│   │   ├── [id]/matchups/[matchupId].ts
│   │   ├── [id]/keeper-fees.ts
│   │   ├── [id]/team-fees.ts
│   │   ├── [id]/trade-proposals.ts
│   │   ├── [id]/trade-proposals/[proposalId].ts
│   │   ├── [id]/trade-proposals/[proposalId]/respond.ts
│   │   ├── [id]/trade-proposals/[proposalId]/execute.ts
│   │   ├── [id]/wagers.ts
│   │   ├── [id]/wagers/[wagerId].ts
│   │   ├── [id]/watchlists.ts
│   │   ├── [id]/portfolio.ts
│   │   ├── [id]/portfolio/refresh.ts
│   │   ├── [id]/playoff-bracket.ts
│   │   ├── [id]/prize-payouts.ts
│   │   ├── [id]/phase-transition.ts
│   │   └── [id]/imports/
│   │       ├── rookie-picks.ts
│   │       ├── roster.ts
│   │       ├── keeper-lock.ts
│   │       ├── season-roster.ts
│   │       ├── schedule.ts
│   │       ├── stats.ts
│   │       ├── standings.ts
│   │       ├── bracket.ts
│   │       ├── champion.ts
│   │       ├── watchlist.ts
│   │       ├── cap-adjustments.ts
│   │       └── prospects.ts
│   ├── prospects/
│   │   ├── index.ts
│   │   └── [id].ts
│   ├── stats/
│   │   ├── projected.ts
│   │   └── previous.ts
│   ├── scrape/
│   │   ├── wnba-players.ts                 ports send-* edge function logic
│   │   └── wnba-prospects.ts
│   ├── notifications/
│   │   ├── telegram.ts
│   │   └── email.ts
│   ├── email-templates/
│   │   ├── index.ts
│   │   └── [name].ts
│   └── admin/
│       ├── check.ts
│       └── data-audit.ts
│
├── drizzle/
│   ├── migrations/                         generated by drizzle-kit
│   │   └── (empty initially)
│   └── meta/                               drizzle metadata
│
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── App.css                             empty placeholder
│   ├── env.d.ts                            ImportMeta types
│   │
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Login.tsx
│   │   ├── FinishSignIn.tsx
│   │   ├── About.tsx
│   │   ├── Privacy.tsx
│   │   ├── Roadmap.tsx
│   │   ├── Changelog.tsx
│   │   ├── Media.tsx
│   │   ├── Profile.tsx
│   │   ├── TeamSelect.tsx
│   │   ├── CreateLeague.tsx                phased wizard
│   │   ├── LeagueHome.tsx
│   │   ├── OwnerDashboard.tsx
│   │   ├── Draft.tsx
│   │   ├── MockDraft.tsx
│   │   ├── DraftHistory.tsx
│   │   ├── RookieDraft.tsx
│   │   ├── Prospects.tsx
│   │   ├── FreeAgents.tsx
│   │   ├── TradeMachine.tsx
│   │   ├── Inbox.tsx
│   │   ├── MatchupDetail.tsx
│   │   ├── Rules.tsx
│   │   ├── RecordBook.tsx
│   │   ├── LeagueManagerHub.tsx
│   │   ├── AdminLeague.tsx
│   │   ├── AdminTeams.tsx
│   │   ├── AdminPlayers.tsx
│   │   ├── AdminRosterImport.tsx
│   │   ├── AdminRosterManager.tsx
│   │   ├── AdminDraftSetup.tsx
│   │   ├── AdminDraftTest.tsx
│   │   ├── AdminDraftPicks.tsx
│   │   ├── AdminRookiePicks.tsx
│   │   ├── AdminTradeManager.tsx
│   │   ├── AdminPortfolio.tsx
│   │   ├── AdminEmailTemplates.tsx
│   │   ├── AdminUpload.tsx
│   │   ├── AdminProspects.tsx
│   │   ├── AdminWNBAScraper.tsx
│   │   ├── AdminWNBAProspects.tsx
│   │   ├── AdminHub.tsx
│   │   ├── AdminMigration.tsx
│   │   ├── AdminPicksView.tsx
│   │   └── AdminDataAudit.tsx
│   │
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── ScrollToTop.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── LeagueTopNav.tsx
│   │   ├── LeagueBottomNav.tsx
│   │   ├── ProtectedRoute.tsx
│   │   ├── UserSync.tsx                    invokes useUserSync at app root
│   │   ├── CapThermometer.tsx
│   │   ├── SummaryCard.tsx
│   │   ├── RosterTable.tsx
│   │   ├── StackingAssistant.tsx
│   │   ├── SavedScenarios.tsx
│   │   ├── DraftBoardView.tsx
│   │   ├── PlayerModal.tsx
│   │   ├── MatchupCard.tsx
│   │   ├── PhaseDetail.tsx
│   │   ├── PlayoffConfig.tsx
│   │   ├── ScheduleWeekPreview.tsx
│   │   ├── RegularSeasonRosterView.tsx
│   │   ├── WatchListView.tsx
│   │   ├── ProposeWagerModal.tsx
│   │   ├── WagerProposal.tsx
│   │   ├── TradeProposalCard.tsx
│   │   ├── CompleteDraftModal.tsx
│   │   ├── RookieDraftResults.tsx
│   │   ├── LeagueRules.tsx
│   │   ├── AdminRosterManagement.tsx
│   │   └── AdminMatchupManager.tsx
│   │
│   ├── hooks/
│   │   ├── useApi.ts
│   │   ├── useUserSync.ts
│   │   ├── useLeagueConfig.ts
│   │   ├── useCanManageLeague.ts
│   │   ├── useRoster.ts
│   │   ├── useSeasonRoster.ts
│   │   ├── useDraft.ts
│   │   ├── useDailyLineup.ts
│   │   ├── useGames.ts
│   │   ├── useMatchups.ts
│   │   ├── useTradeProposals.ts
│   │   ├── useWagers.ts
│   │   ├── useWatchList.ts
│   │   ├── useTeamFees.ts
│   │   ├── usePreviousStats.ts
│   │   ├── useProjectedStats.ts
│   │   ├── useModalA11y.ts
│   │   ├── useAdminCheck.ts
│   │   └── useUnreadNotifications.ts
│   │
│   ├── lib/
│   │   ├── clerk.ts
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   └── schema.ts                   single Drizzle schema for all wnba_* tables
│   │   ├── api/
│   │   │   ├── leagueApi.ts
│   │   │   ├── teamApi.ts
│   │   │   ├── playerApi.ts
│   │   │   ├── rosterApi.ts
│   │   │   ├── seasonRosterApi.ts
│   │   │   ├── draftApi.ts
│   │   │   ├── pickApi.ts
│   │   │   ├── rookieDraftApi.ts
│   │   │   ├── matchupApi.ts
│   │   │   ├── tradeApi.ts
│   │   │   ├── wagerApi.ts
│   │   │   ├── watchlistApi.ts
│   │   │   ├── feeApi.ts
│   │   │   ├── portfolioApi.ts
│   │   │   ├── prospectApi.ts
│   │   │   ├── statsApi.ts
│   │   │   ├── importApi.ts
│   │   │   ├── notificationApi.ts
│   │   │   └── adminApi.ts
│   │   ├── presets/
│   │   │   └── wnba.ts                     WNBA_LEAGUE_PRESET
│   │   ├── branding.ts
│   │   ├── logger.ts
│   │   ├── nbaTeams.ts                     ported (cross-league reuse for any NBA player meta)
│   │   ├── wnbaTeams.ts                    ported
│   │   └── utils.ts                        misc helpers (date, formatting, classnames)
│   │
│   ├── rules/
│   │   ├── capRules.ts
│   │   ├── keeperRules.ts
│   │   ├── validationRules.ts
│   │   ├── scoringRules.ts
│   │   ├── scheduleRules.ts
│   │   ├── tradeRules.ts
│   │   ├── prizePoolRules.ts
│   │   ├── rookieKeeperMap.ts
│   │   └── lottery.ts
│   │
│   ├── importers/
│   │   ├── parseTSV.ts                     shared parser
│   │   ├── parseCSV.ts                     shared parser (papaparse wrapper)
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
│   │
│   ├── contexts/
│   │   └── LeagueContext.tsx               currentLeagueId switcher
│   │
│   ├── data/
│   │   └── hinkieQuotes.ts                 ported from mns/
│   │
│   ├── store/
│   │   └── index.ts                        Zustand: fontSize, soundsMuted, UI prefs
│   │
│   ├── types/
│   │   ├── index.ts                        re-exports of inferred Drizzle types + LeagueConfig
│   │   ├── league.ts
│   │   ├── team.ts
│   │   ├── player.ts
│   │   ├── roster.ts
│   │   ├── draft.ts
│   │   ├── trade.ts
│   │   ├── wager.ts
│   │   ├── matchup.ts
│   │   └── leagueConfig.ts                 the typed shape for leagues.config jsonb
│   │
│   └── tests/                              Vitest tests for src/rules/*
│       ├── capRules.test.ts
│       ├── keeperRules.test.ts
│       ├── validationRules.test.ts
│       ├── scoringRules.test.ts
│       ├── scheduleRules.test.ts
│       ├── tradeRules.test.ts
│       ├── prizePoolRules.test.ts
│       ├── rookieKeeperMap.test.ts
│       └── lottery.test.ts
│
├── public/
│   ├── icons/                              copy from mns/public/icons
│   ├── hinkie/                             copy from mns/public/hinkie
│   ├── prizePool/                          copy from mns/public/prizePool
│   ├── video/                              copy from mns/public/video
│   ├── quotes/                             copy from mns/public/quotes
│   ├── manifest.json
│   └── robots.txt
│
└── email-templates/
    ├── keeper-locked.html
    ├── draft-pick.html
    ├── trade-proposed.html
    ├── trade-accepted.html
    ├── wager-proposed.html
    ├── wager-settled.html
    └── season-started.html
```

**Total file count:** ~210 files. Heavy upfront, but each is small and the structure mirrors `mns/` closely so familiarity carries over.

---

## 3. `package.json`

```json
{
  "name": "wnba-mns-fantasy",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:check": "drizzle-kit check"
  },
  "dependencies": {
    "@clerk/backend": "^1",
    "@clerk/clerk-react": "^5",
    "@neondatabase/serverless": "^1",
    "@sentry/react": "^10",
    "@tanstack/react-query": "^5",
    "@vercel/blob": "^0",
    "drizzle-orm": "^0.45",
    "html-to-image": "^1",
    "papaparse": "^5",
    "react": "^19",
    "react-dom": "^19",
    "react-router-dom": "^7",
    "sonner": "^2",
    "zod": "^3",
    "zustand": "^4"
  },
  "devDependencies": {
    "@eslint/js": "^9",
    "@tailwindcss/postcss": "^4",
    "@types/node": "^24",
    "@types/papaparse": "^5",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vercel/node": "^3",
    "@vitejs/plugin-react": "^5",
    "autoprefixer": "^10",
    "drizzle-kit": "^0.31",
    "eslint": "^9",
    "eslint-plugin-react-hooks": "^5",
    "eslint-plugin-react-refresh": "^0.4",
    "globals": "^16",
    "postcss": "^8",
    "sharp-cli": "^5",
    "svgo": "^4",
    "tailwindcss": "^4",
    "typescript": "~5.9",
    "typescript-eslint": "^8",
    "vite": "^7",
    "vite-plugin-image-optimizer": "^2",
    "vitest": "^2"
  }
}
```

**Notes:**
- Drops Supabase libraries entirely.
- Drops Resend/Telegram client libraries — these get called via `fetch` from API routes.
- Adds Drizzle, Clerk, Neon driver, Zod, Zustand, Vitest, Vercel SDK + Blob.

---

## 4. `vercel.json`

```json
{
  "functions": {
    "api/**/*.ts": {
      "includeFiles": "src/lib/db/schema.ts,src/lib/presets/wnba.ts,src/rules/**/*.ts,src/types/**/*.ts,api/_*.ts,email-templates/*.html",
      "maxDuration": 30
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/((?!api).*)", "destination": "/index.html" }
  ]
}
```

---

## 5. `drizzle.config.ts`

```ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // table prefix is enforced in schema (not at config level)
  tablesFilter: ['wnba_*', 'users', 'marketing_*', 'email_templates'],
  verbose: true,
  strict: true,
} satisfies Config
```

`tablesFilter` keeps Drizzle introspection scoped to WNBA tables + the cross-game shared tables we touch. Prevents accidentally generating migrations for `ncaa_*` tables we don't own.

---

## 6. `.env.example`

```bash
# === Clerk (shared with all mnsfantasy.com subdomains) ===
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...

# === Neon Postgres (shared with NCAA, golf) ===
DATABASE_URL=postgresql://neondb_owner:...@...neon.tech/neondb?sslmode=require

# === App config ===
VITE_APP_URL=https://wnba.mnsfantasy.com
VITE_PLATFORM_URL=https://mnsfantasy.com
VITE_GAME_SLUG=wnba-2026

# === Sentry (optional) ===
VITE_SENTRY_DSN=

# === Resend (transactional email) ===
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@e.moneyneversleeps.app

# === Telegram bots ===
TELEGRAM_DRAFT_BOT_TOKEN=...
TELEGRAM_DRAFT_DEFAULT_CHAT_ID=...
TELEGRAM_ALERT_BOT_TOKEN=...
TELEGRAM_ALERT_CHAT_ID=...

# === Portfolio (optional, prize pool wallet) ===
ALCHEMY_API_KEY=
COINGECKO_API_KEY=

# === Admins (until users.role column lands) ===
ADMIN_USER_IDS=user_xxx,user_yyy

# === Vercel Blob (when needed) ===
BLOB_READ_WRITE_TOKEN=
```

---

## 7. Initial Drizzle schema (`src/lib/db/schema.ts`)

**One file, ~600 lines, all `wnba_*` tables defined per [REFACTOR_PLAN.md §5b](REFACTOR_PLAN.md). Plus references to the shared `users` table.** This is the single source of truth for the DB shape.

Key patterns:
- Every multi-tenant table gets `league_id` FK + indexed
- Every joinable table indexed on FKs
- JSONB columns typed via Drizzle's `$type<>()` helper for `LeagueConfig`, `pick.tradeHistory`, etc.
- Timestamps via `defaultNow()` + `set_updated_at`-equivalent done at app layer

The schema gets generated once and `db:push`ed. Migration files become the audit trail going forward.

**Sample (one table to show pattern):**

```ts
import { pgTable, text, timestamp, integer, boolean, jsonb, uuid } from 'drizzle-orm/pg-core'
import type { LeagueConfig } from '../../types/leagueConfig'

export const users = pgTable('users', {
  id: text('id').primaryKey(),                        // Clerk user ID
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('owner'),      // 'owner' | 'admin'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const wnbaLeagues = pgTable('wnba_leagues', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  seasonYear: integer('season_year').notNull(),
  config: jsonb('config').$type<LeagueConfig>().notNull(),
  leaguePhase: text('league_phase').notNull().default('keeper_season'),
  keepersLocked: boolean('keepers_locked').notNull().default(false),
  commissionerId: text('commissioner_id').references(() => users.id),
  scoringMode: text('scoring_mode').notNull(),
  seasonStartedAt: timestamp('season_started_at'),
  seasonStartedBy: text('season_started_by'),
  telegramChatId: text('telegram_chat_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ... repeat for all wnba_* tables per REFACTOR_PLAN §5b
```

---

## 8. Critical files (rough content sketches)

These are the load-bearing files. Sketching content now so the user can sanity-check before code is written.

### 8a. `src/main.tsx`

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import { logger } from './lib/logger'
import { App } from './App'
import './index.css'

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY')

const sentryDsn = import.meta.env.VITE_SENTRY_DSN
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: true,
    beforeSend(event) {
      if (window.location.hostname === 'localhost') return null
      return event
    },
  })
}

window.addEventListener('unhandledrejection', (event) => {
  logger.critical('Unhandled promise rejection', event.reason, {
    promise: String(event.promise),
  })
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => logger.error('Mutation failed', error),
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={clerkPubKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/teams"
      signUpFallbackRedirectUrl="/teams"
      afterSignOutUrl="/"
    >
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ClerkProvider>
  </StrictMode>
)
```

### 8b. `src/App.tsx`

Standard Vite SPA router pattern. Mirrors `mns/src/App.tsx` route table but:
- `<ProtectedRoute>` uses Clerk `useAuth().isSignedIn`
- `<UserSync />` rendered once at root (calls `useUserSync` hook)
- `<LeagueProvider>` wraps protected routes
- All routes lazy-loaded except Home + Login

### 8c. `api/_db.ts`

```ts
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '../src/lib/db/schema.js'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
export { schema }
```

### 8d. `api/_middleware.ts`

```ts
import { verifyToken } from '@clerk/backend'
import type { VercelRequest } from '@vercel/node'
import { db } from './_db.js'
import { users, wnbaLeagues, wnbaTeamOwners } from '../src/lib/db/schema.js'
import { eq, and } from 'drizzle-orm'

export async function verifyAuth(req: VercelRequest): Promise<string | null> {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return null
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! })
    return payload.sub
  } catch (e) {
    return null
  }
}

export async function isSiteAdmin(userId: string): Promise<boolean> {
  // Phase 0/1: check ADMIN_USER_IDS env var
  // Phase 1+: check users.role column
  const envAdmins = (process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (envAdmins.includes(userId)) return true
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1)
  return row?.role === 'admin'
}

export async function isCommissioner(userId: string, leagueId: string): Promise<boolean> {
  const [row] = await db.select({ commissionerId: wnbaLeagues.commissionerId }).from(wnbaLeagues).where(eq(wnbaLeagues.id, leagueId)).limit(1)
  return row?.commissionerId === userId
}

export async function isTeamOwner(userId: string, teamId: string): Promise<boolean> {
  // teamId → email join on user → match userId
  const [row] = await db
    .select({ userId: wnbaTeamOwners.userId })
    .from(wnbaTeamOwners)
    .where(and(eq(wnbaTeamOwners.teamId, teamId), eq(wnbaTeamOwners.userId, userId)))
    .limit(1)
  return !!row
}

export async function canManageLeague(userId: string, leagueId: string): Promise<boolean> {
  return (await isSiteAdmin(userId)) || (await isCommissioner(userId, leagueId))
}
```

### 8e. `api/users/sync.ts`

Verbatim port of the NCAA pattern — POST endpoint that upserts the Clerk user into the shared `users` table. Idempotent.

### 8f. `src/hooks/useApi.ts`

```ts
import { useAuth } from '@clerk/clerk-react'
import { useCallback } from 'react'

export function useApi() {
  const { getToken } = useAuth()
  const apiFetch = useCallback(
    async <T = unknown>(path: string, options?: RequestInit): Promise<T> => {
      const token = await getToken()
      const res = await fetch(path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...options?.headers,
        },
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Request failed' }))
        throw new Error(error.error || error.message || `API error: ${res.status}`)
      }
      return res.json()
    },
    [getToken]
  )
  return { apiFetch }
}
```

### 8g. `src/hooks/useUserSync.ts`

Verbatim port of NCAA pattern — fires once after Clerk hydrates, POSTs to `/api/users/sync`.

### 8h. `src/lib/presets/wnba.ts`

```ts
import type { LeagueConfig } from '../../types/leagueConfig'

export const WNBA_LEAGUE_PRESET: LeagueConfig = {
  sport: 'wnba',
  season: { year: 2026, startDate: '2026-05-15', weeks: 22 },
  roster: {
    activeSize: 11,
    starterSize: 8,
    irSlots: 1,
    benchAllowed: true,
    maxKeepers: 6,
    redshirtsAllowed: true,
    intStashAllowed: true,
  },
  draft: {
    rounds: 11,
    type: 'snake',
    rookieRounds: 2,
    rookieYearsTracked: 3,
    rookieOrderMethod: 'manual',
    allowAdminOverride: true,
  },
  cap: {
    enabled: true,
    floor: 0,
    base: 1_500_000,
    firstApron: 0,         // disabled — set to base if WNBA picks up apron rules
    secondApron: 0,
    hardCap: 1_500_000,
    tradeDelta: 0,
    penaltyRatePerM: 0,
  },
  fees: {
    buyIn: 50,
    firstApronFee: 0,
    franchiseTagFee: 15,
    redshirtFee: 10,
    activationFee: 25,
    penaltyRatePerM: 0,
  },
  scoring: {
    categories: ['FG%', 'FT%', '3PM', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'A/TO'],
    mode: 'category_record',
  },
  keeper: {
    rookieRoundMap: {
      '1.1-1.3': 5, '1.4-1.6': 6, '1.7-1.9': 7, '1.10-1.12': 8,
      '2.x': 11, '3.x': 11,
    },
    advanceRule: 'minus_one',
    fallbackRound: null,           // null forces explicit value during import
    franchiseTagAllowed: true,
    intStashAllowed: true,
  },
  schedule: {
    tradeDeadlineWeek: 16,
    tradeDeadlineDate: '',
    playoffTeams: 6,
    playoffWeeks: 3,
    playoffByeTeams: 2,
    consolationWeeks: 0,
    combineCup: false,             // WNBA has no Cup
    combineAllStar: true,
    extendFirstWeek: false,
  },
  prizePool: {
    enabled: true,
    walletEnabled: false,           // can flip on later
    zones: {
      boilerThreshold: 300,
      bernieThreshold: 10_000,
      gekkoSplit: [70, 20, 10],
      bernieSplit: [40, 15, 9, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      boilerSmallSplit: [80, 20],
    },
  },
  notifications: {
    telegramEnabled: true,
    emailEnabled: true,
    drafts: true,
    trades: true,
    wagers: true,
  },
}
```

Numbers above are placeholders matching reasonable WNBA-2026 defaults. Commissioner overrides any of them in CreateLeague.

### 8i. `src/rules/keeperRules.ts`

Pure functions, config-driven:

```ts
import type { LeagueConfig } from '../types/leagueConfig'
import type { Player, RosterEntry } from '../types'

export function baseKeeperRound(player: Player, config: LeagueConfig): number | null {
  if (player.rookieDraftInfo) {
    const key = `${player.rookieDraftInfo.round}.${player.rookieDraftInfo.pick}`
    return config.keeper.rookieRoundMap[key]
      ?? config.keeper.rookieRoundMap[`${player.rookieDraftInfo.round}.x`]
      ?? config.keeper.fallbackRound
  }
  if (player.keeperPriorYearRound != null) {
    if (config.keeper.advanceRule === 'minus_one') return Math.max(1, player.keeperPriorYearRound - 1)
    if (config.keeper.advanceRule === 'flat') return player.keeperPriorYearRound
    // 'custom' → leave to caller
  }
  if (player.migratedKeeperRound != null) return player.migratedKeeperRound
  return config.keeper.fallbackRound
}

export function stackKeeperRounds(entries: RosterEntry[], config: LeagueConfig): { entries: RosterEntry[]; franchiseTags: number } {
  const maxRound = config.draft.rounds  // was hardcoded 13 in mns/
  // ... port stacking algorithm; replace every `13` with maxRound
}

export function computeSummary(/* config-driven cap calcs */) { /* ... */ }
```

No `|| 13`. No `225_000_000`. Everything from config.

---

## 9. Schema migration plan

### 9a. Initial migration (Phase 0)

After scaffold and Drizzle schema is written:

```bash
npm run db:generate    # produces drizzle/migrations/0000_init.sql
# Review SQL — never trust auto-generated migrations blindly
npm run db:push        # applies to Neon
```

Gives us all `wnba_*` tables in the shared Neon DB without touching `ncaa_*` or shared tables.

### 9b. `users.role` column addition (Phase 1)

If we go with the column-based admin role (default per Section 1e), this migration adds it to the existing shared `users` table. **This touches a table other apps depend on.** Need to:
1. Coordinate with NCAA app (verify no conflict)
2. Default to `'owner'` so existing rows don't break

```sql
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'owner';
```

### 9c. Going forward

Every schema change → `db:generate` → review SQL → `db:push`. No manual SQL scripts unless absolutely necessary. Migrations committed to the repo as the audit trail.

---

## 10. What gets ported from `mns/` (asset copy, not code)

Pure copies, no edits:

```
mns/public/icons/         → wnba-mns-fantasy/public/icons/
mns/public/hinkie/        → wnba-mns-fantasy/public/hinkie/
mns/public/prizePool/     → wnba-mns-fantasy/public/prizePool/
mns/public/video/         → wnba-mns-fantasy/public/video/
mns/public/quotes/        → wnba-mns-fantasy/public/quotes/
mns/public/manifest.json  → wnba-mns-fantasy/public/manifest.json
mns/src/data/hinkieQuotes.ts → wnba-mns-fantasy/src/data/hinkieQuotes.ts
```

Branding (`src/lib/branding.ts`) is hand-written but pulls these assets.

---

## 11. Doc moves (during scaffold)

```
mns/FEATURES.md           → wnba-mns-fantasy/FEATURES.md          (the contract; stays accurate to mns/ at time of fork)
mns/REFACTOR_PLAN.md      → wnba-mns-fantasy/REFACTOR_PLAN.md     (the plan)
mns/SCAFFOLD_PLAN.md      → wnba-mns-fantasy/SCAFFOLD_PLAN.md     (this file)
```

Original copies stay in `mns/` for historical reference but `wnba-mns-fantasy/` is where they get maintained going forward.

---

## 12. Scaffold execution order

When approval lands, here's the order I'd create files. Each step ends with a working state.

1. **Folder + base configs** — `package.json`, `tsconfig*`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `vitest.config.ts`, `drizzle.config.ts`, `eslint.config.js`, `vercel.json`, `index.html`, `.env.example`, `.gitignore`, `.nvmrc`, `README.md`. Run `npm install`.
2. **Doc moves** — `FEATURES.md`, `REFACTOR_PLAN.md`, `SCAFFOLD_PLAN.md` from `mns/`.
3. **Asset copy** — public/* + hinkieQuotes.ts.
4. **Types skeleton** — `src/types/leagueConfig.ts` first (everything depends on it), then the rest.
5. **Drizzle schema** — `src/lib/db/schema.ts`. Run `db:generate` to verify SQL is sane (don't push yet).
6. **Presets** — `src/lib/presets/wnba.ts`.
7. **Logger + branding** — `src/lib/logger.ts`, `src/lib/branding.ts`.
8. **API skeleton** — `api/_db.ts`, `api/_middleware.ts`, `api/_validation.ts`, `api/_rateLimit.ts`, `api/health.ts`, `api/users/sync.ts`. (Full route tree comes during Phase 1+ of REFACTOR_PLAN.)
9. **Hooks skeleton** — `useApi`, `useUserSync`, `useLeagueConfig`. Empty stubs for the rest.
10. **App shell** — `main.tsx`, `App.tsx`, ProtectedRoute, UserSync, ScrollToTop, ErrorBoundary, Header, Footer, LeagueContext. Lazy stubs for every page (returns "TODO: <page>").
11. **Sign-in pages** — `Login.tsx`, `FinishSignIn.tsx`, `Home.tsx` (so unauth landing works).
12. **Rules engine** — `src/rules/*` (every file with full implementation, ported from `mns/lib/keeperAlgorithms.ts` etc., made config-driven).
13. **Vitest setup** — tests for `src/rules/*`. CI green.
14. **Schema push** — `npm run db:push`. WNBA tables created in Neon.
15. **Local smoke test** — `npm run dev`, sign in, verify `/api/health` returns OK, verify `/api/users/sync` upserts your Clerk user into Neon.
16. **First Vercel deploy** — `wnba-mns-fantasy.vercel.app` lives, sign-in works, `/api/health` returns 200.
17. **DNS cutover** — `wnba.mnsfantasy.com` points at the new Vercel project. Verify SSO from `mnsfantasy.com`.

After step 17, Phase 0 is done. Phases 1-12 of REFACTOR_PLAN proceed inside the new folder.

Each step is committed individually (squash-and-merge to taste). User approves each commit — same rule as today.

---

## 13. What I need from you to start

1. **Approve this plan** (or call out changes).
2. **Confirm Section 1e defaults** (or override).
3. **Confirm asset copy from `mns/`** is fine (logos, hinkie, etc.).
4. **Provide `DATABASE_URL`** when ready — won't commit it; just needed to run `db:push` against Neon.
5. **Provide `VITE_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`** when ready — same caveat.
6. **Coordinate `users.role` column add with NCAA app maintainer** (you, presumably) before that migration runs.

Once those are in hand, scaffold runs in commit-by-commit chunks per Section 12.

---

*This plan is read-only. No files have been created. Approval needed before scaffold begins.*
