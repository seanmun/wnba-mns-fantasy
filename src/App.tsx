import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ScrollToTop } from './components/ScrollToTop'
import { UserSync } from './components/UserSync'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { LeagueTopNav } from './components/LeagueTopNav'
import { LeagueBottomNav } from './components/LeagueBottomNav'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LeagueProvider } from './contexts/LeagueContext'

// Eager — needed for initial render
import { Home } from './pages/Home'
import { Login } from './pages/Login'

// Public — lazy
const SignIn = lazy(() => import('./pages/SignIn').then((m) => ({ default: m.SignIn })))
const SignUp = lazy(() => import('./pages/SignUp').then((m) => ({ default: m.SignUp })))
const FinishSignIn = lazy(() => import('./pages/FinishSignIn').then((m) => ({ default: m.FinishSignIn })))
const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })))
const Privacy = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.Privacy })))
const Roadmap = lazy(() => import('./pages/Roadmap').then((m) => ({ default: m.Roadmap })))
const Changelog = lazy(() => import('./pages/Changelog').then((m) => ({ default: m.Changelog })))
const Media = lazy(() => import('./pages/Media').then((m) => ({ default: m.Media })))

// Authenticated
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })))
const TeamSelect = lazy(() => import('./pages/TeamSelect').then((m) => ({ default: m.TeamSelect })))
const CreateLeague = lazy(() => import('./pages/CreateLeague').then((m) => ({ default: m.CreateLeague })))

// League scope
const LeagueHome = lazy(() => import('./pages/LeagueHome').then((m) => ({ default: m.LeagueHome })))
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard').then((m) => ({ default: m.OwnerDashboard })))
const Draft = lazy(() => import('./pages/Draft').then((m) => ({ default: m.Draft })))
const MockDraft = lazy(() => import('./pages/MockDraft').then((m) => ({ default: m.MockDraft })))
const DraftHistory = lazy(() => import('./pages/DraftHistory').then((m) => ({ default: m.DraftHistory })))
const RookieDraft = lazy(() => import('./pages/RookieDraft').then((m) => ({ default: m.RookieDraft })))
const Prospects = lazy(() => import('./pages/Prospects').then((m) => ({ default: m.Prospects })))
const FreeAgents = lazy(() => import('./pages/FreeAgents').then((m) => ({ default: m.FreeAgents })))
const TradeMachine = lazy(() => import('./pages/TradeMachine').then((m) => ({ default: m.TradeMachine })))
const Inbox = lazy(() => import('./pages/Inbox').then((m) => ({ default: m.Inbox })))
const MatchupDetail = lazy(() => import('./pages/MatchupDetail').then((m) => ({ default: m.MatchupDetail })))
const Rules = lazy(() => import('./pages/Rules').then((m) => ({ default: m.Rules })))
const RecordBook = lazy(() => import('./pages/RecordBook').then((m) => ({ default: m.RecordBook })))

// League manager
const LeagueManagerHub = lazy(() => import('./pages/LeagueManagerHub').then((m) => ({ default: m.LeagueManagerHub })))
const AdminLeague = lazy(() => import('./pages/AdminLeague').then((m) => ({ default: m.AdminLeague })))
const AdminTeams = lazy(() => import('./pages/AdminTeams').then((m) => ({ default: m.AdminTeams })))
const AdminRosterImport = lazy(() => import('./pages/AdminRosterImport').then((m) => ({ default: m.AdminRosterImport })))
const AdminRosterManager = lazy(() => import('./pages/AdminRosterManager').then((m) => ({ default: m.AdminRosterManager })))
const AdminDraftSetup = lazy(() => import('./pages/AdminDraftSetup').then((m) => ({ default: m.AdminDraftSetup })))
const AdminDraftTest = lazy(() => import('./pages/AdminDraftTest').then((m) => ({ default: m.AdminDraftTest })))
const AdminDraftPicks = lazy(() => import('./pages/AdminDraftPicks').then((m) => ({ default: m.AdminDraftPicks })))
const AdminRookiePicks = lazy(() => import('./pages/AdminRookiePicks').then((m) => ({ default: m.AdminRookiePicks })))
const AdminTradeManager = lazy(() => import('./pages/AdminTradeManager').then((m) => ({ default: m.AdminTradeManager })))
const AdminPortfolio = lazy(() => import('./pages/AdminPortfolio').then((m) => ({ default: m.AdminPortfolio })))

// Site admin
const AdminHub = lazy(() => import('./pages/AdminHub').then((m) => ({ default: m.AdminHub })))
const AdminPlayers = lazy(() => import('./pages/AdminPlayers').then((m) => ({ default: m.AdminPlayers })))
const AdminUpload = lazy(() => import('./pages/AdminUpload').then((m) => ({ default: m.AdminUpload })))
const AdminProspects = lazy(() => import('./pages/AdminProspects').then((m) => ({ default: m.AdminProspects })))
const AdminWNBAScraper = lazy(() => import('./pages/AdminWNBAScraper').then((m) => ({ default: m.AdminWNBAScraper })))
const AdminWNBAProspects = lazy(() => import('./pages/AdminWNBAProspects').then((m) => ({ default: m.AdminWNBAProspects })))
const AdminMigration = lazy(() => import('./pages/AdminMigration').then((m) => ({ default: m.AdminMigration })))
const AdminPicksView = lazy(() => import('./pages/AdminPicksView').then((m) => ({ default: m.AdminPicksView })))
const AdminEmailTemplates = lazy(() => import('./pages/AdminEmailTemplates').then((m) => ({ default: m.AdminEmailTemplates })))
const AdminDataAudit = lazy(() => import('./pages/AdminDataAudit').then((m) => ({ default: m.AdminDataAudit })))

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-mns-dark">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-500 border-r-transparent" />
        <div className="mt-4 text-gray-400">Loading...</div>
      </div>
    </div>
  )
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      <Footer />
    </div>
  )
}

function LeagueLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <LeagueTopNav />
      <main className="flex-1 pb-16 lg:pb-0">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      <Footer />
      <LeagueBottomNav />
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: { background: '#121212', border: '1px solid #374151', color: '#fff' },
          className: 'text-sm',
        }}
      />
      <UserSync />
      <LeagueProvider>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<AppLayout><Home /></AppLayout>} />
            <Route path="/login" element={<Login />} />
            <Route path="/sign-in/*" element={<SignIn />} />
            <Route path="/sign-up/*" element={<SignUp />} />
            <Route path="/finishSignIn" element={<FinishSignIn />} />
            <Route path="/about" element={<AppLayout><About /></AppLayout>} />
            <Route path="/privacy" element={<AppLayout><Privacy /></AppLayout>} />
            <Route path="/roadmap" element={<AppLayout><Roadmap /></AppLayout>} />
            <Route path="/changelog" element={<AppLayout><Changelog /></AppLayout>} />
            <Route path="/media" element={<AppLayout><Media /></AppLayout>} />

            {/* Authenticated */}
            <Route path="/profile" element={<ProtectedRoute><AppLayout><Profile /></AppLayout></ProtectedRoute>} />
            <Route path="/teams" element={<ProtectedRoute><AppLayout><TeamSelect /></AppLayout></ProtectedRoute>} />
            <Route path="/create-league" element={<ProtectedRoute><AppLayout><CreateLeague /></AppLayout></ProtectedRoute>} />

            {/* League scope */}
            <Route path="/league/:leagueId" element={<ProtectedRoute><LeagueLayout><LeagueHome /></LeagueLayout></ProtectedRoute>} />
            <Route path="/league/:leagueId/matchup/:matchupId" element={<ProtectedRoute><LeagueLayout><MatchupDetail /></LeagueLayout></ProtectedRoute>} />
            <Route path="/league/:leagueId/team/:teamId" element={<ProtectedRoute><LeagueLayout><OwnerDashboard /></LeagueLayout></ProtectedRoute>} />
            <Route path="/league/:leagueId/draft" element={<ProtectedRoute><LeagueLayout><Draft /></LeagueLayout></ProtectedRoute>} />
            <Route path="/league/:leagueId/free-agents" element={<ProtectedRoute><LeagueLayout><FreeAgents /></LeagueLayout></ProtectedRoute>} />
            <Route path="/league/:leagueId/record-book" element={<ProtectedRoute><LeagueLayout><RecordBook /></LeagueLayout></ProtectedRoute>} />
            <Route path="/league/:leagueId/rookie-draft" element={<ProtectedRoute><LeagueLayout><RookieDraft /></LeagueLayout></ProtectedRoute>} />
            <Route path="/league/:leagueId/rules" element={<ProtectedRoute><LeagueLayout><Rules /></LeagueLayout></ProtectedRoute>} />
            <Route path="/league/:leagueId/prospects" element={<ProtectedRoute><LeagueLayout><Prospects /></LeagueLayout></ProtectedRoute>} />
            <Route path="/league/:leagueId/mock-draft" element={<ProtectedRoute><LeagueLayout><MockDraft /></LeagueLayout></ProtectedRoute>} />
            <Route path="/league/:leagueId/draft-history" element={<ProtectedRoute><LeagueLayout><DraftHistory /></LeagueLayout></ProtectedRoute>} />
            <Route path="/league/:leagueId/trade-machine" element={<ProtectedRoute><LeagueLayout><TradeMachine /></LeagueLayout></ProtectedRoute>} />
            <Route path="/league/:leagueId/inbox" element={<ProtectedRoute><LeagueLayout><Inbox /></LeagueLayout></ProtectedRoute>} />

            {/* League manager */}
            <Route path="/lm" element={<ProtectedRoute><AppLayout><LeagueManagerHub /></AppLayout></ProtectedRoute>} />
            <Route path="/lm/league" element={<ProtectedRoute><AppLayout><AdminLeague /></AppLayout></ProtectedRoute>} />
            <Route path="/lm/teams" element={<ProtectedRoute><AppLayout><AdminTeams /></AppLayout></ProtectedRoute>} />
            <Route path="/lm/rosters" element={<ProtectedRoute><AppLayout><AdminRosterManager /></AppLayout></ProtectedRoute>} />
            <Route path="/lm/roster-import" element={<ProtectedRoute><AppLayout><AdminRosterImport /></AppLayout></ProtectedRoute>} />
            <Route path="/lm/draft-setup" element={<ProtectedRoute><AppLayout><AdminDraftSetup /></AppLayout></ProtectedRoute>} />
            <Route path="/lm/draft-test" element={<ProtectedRoute><AppLayout><AdminDraftTest /></AppLayout></ProtectedRoute>} />
            <Route path="/lm/draft-picks" element={<ProtectedRoute><AppLayout><AdminDraftPicks /></AppLayout></ProtectedRoute>} />
            <Route path="/lm/rookie-picks" element={<ProtectedRoute><AppLayout><AdminRookiePicks /></AppLayout></ProtectedRoute>} />
            <Route path="/lm/trade" element={<ProtectedRoute><AppLayout><AdminTradeManager /></AppLayout></ProtectedRoute>} />
            <Route path="/lm/portfolio" element={<ProtectedRoute><AppLayout><AdminPortfolio /></AppLayout></ProtectedRoute>} />

            {/* Site admin */}
            <Route path="/site-admin" element={<ProtectedRoute><AppLayout><AdminHub /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/players" element={<ProtectedRoute><AppLayout><AdminPlayers /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/upload" element={<ProtectedRoute><AppLayout><AdminUpload /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/prospects" element={<ProtectedRoute><AppLayout><AdminProspects /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/wnba-scraper" element={<ProtectedRoute><AppLayout><AdminWNBAScraper /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/wnba-prospects" element={<ProtectedRoute><AppLayout><AdminWNBAProspects /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/migration" element={<ProtectedRoute><AppLayout><AdminMigration /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/picks" element={<ProtectedRoute><AppLayout><AdminPicksView /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/email-templates" element={<ProtectedRoute><AppLayout><AdminEmailTemplates /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/data-audit" element={<ProtectedRoute><AppLayout><AdminDataAudit /></AppLayout></ProtectedRoute>} />
          </Routes>
        </Suspense>
      </LeagueProvider>
    </BrowserRouter>
  )
}
