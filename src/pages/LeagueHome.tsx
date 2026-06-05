import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { toast } from 'sonner'
import { useApi } from '../hooks/useApi'
import { useLeague } from '../contexts/LeagueContext'
import { LEAGUE_PHASE_LABELS } from '../types/league'

export function LeagueHome() {
  const { leagueId } = useParams<{ leagueId: string }>()
  const { user } = useUser()
  const { userLeagues, loading } = useLeague()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-500 border-r-transparent" />
      </div>
    )
  }

  const league = userLeagues.find((l) => l.id === leagueId)

  if (!league) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">League not found</h1>
        <p className="text-gray-400 mb-6">
          You don't have access to this league, or it doesn't exist.
        </p>
        <Link
          to="/teams"
          className="inline-block px-5 py-2.5 bg-mns-card hover:bg-mns-hover border border-gray-700 text-white font-semibold rounded-lg"
        >
          ← Back to your leagues
        </Link>
      </div>
    )
  }

  const isCommissioner = league.commissionerId === user?.id

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl sm:text-4xl font-bold">{league.name}</h1>
          {isCommissioner && (
            <span className="px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-green-400/15 text-green-400 border border-green-400/30 rounded-full">
              Commissioner
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
          <span>{league.sport.toUpperCase()} · {league.seasonYear}</span>
          <span className="text-gray-600">·</span>
          <span className="text-pink-400 font-semibold">
            {LEAGUE_PHASE_LABELS[league.leaguePhase]}
          </span>
        </div>
      </div>

      {/* Commissioner next steps */}
      {isCommissioner && <CommissionerChecklist leagueId={league.id} />}

      {/* Teams placeholder */}
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">Teams</h2>
        <div className="bg-mns-card border border-gray-800 rounded-lg p-8 text-center text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-semibold text-gray-300 mb-1">No teams yet</p>
          <p className="text-sm">
            {isCommissioner
              ? 'Add teams from the LM hub to get this league moving.'
              : 'The commissioner is still setting up. Hang tight.'}
          </p>
        </div>
      </section>
    </div>
  )
}

function CommissionerChecklist({ leagueId }: { leagueId: string }) {
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Commissioner Setup</h2>
        <Link to="/lm" className="text-sm text-green-400 hover:text-green-300">
          Open LM hub →
        </Link>
      </div>
      <div className="bg-mns-card border border-gray-800 rounded-lg divide-y divide-gray-800">
        <StaticStep
          n={1}
          title="Add teams"
          description="Create 4-12 teams and invite owners by email."
          cta="Add teams"
          href="/lm/teams"
        />
        <StaticStep
          n={2}
          title="Configure league rules"
          description="Override cap, fees, schedule, scoring — anything from the WNBA preset."
          cta="League settings"
          href="/lm/league"
        />
        <PopulatePoolStep leagueId={leagueId} n={3} />
        <StaticStep
          n={4}
          title="Import / assign rosters"
          description="Assign players to teams. Capture prior keeper rounds per player so keepers don't default to round 13."
          cta="Roster import"
          href="/lm/roster-import"
        />
        <StaticStep
          n={5}
          title="Lock keepers, set rookie picks"
          description="Once owners submit, lock the keeper phase. Assign rookie draft picks."
          cta="Rookie picks"
          href="/lm/rookie-picks"
        />
        <StaticStep
          n={6}
          title="Set up the draft"
          description="Configure draft order, slot keeper picks into rounds, start the draft."
          cta="Draft setup"
          href="/lm/draft-setup"
        />
      </div>
      <p className="mt-3 text-xs text-gray-500">
        League ID: <code className="text-gray-400">{leagueId}</code>
      </p>
    </section>
  )
}

function StaticStep({
  n,
  title,
  description,
  cta,
  href,
}: {
  n: number
  title: string
  description: string
  cta: string
  href: string
}) {
  return (
    <div className="p-5 flex items-start gap-4">
      <StepNumber n={n} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-white">{title}</div>
        <p className="text-sm text-gray-400 mt-1">{description}</p>
      </div>
      <Link
        to={href}
        className="flex-shrink-0 px-3 py-1.5 text-sm bg-green-500 hover:bg-green-400 text-black font-semibold rounded-lg transition-colors whitespace-nowrap"
      >
        {cta}
      </Link>
    </div>
  )
}

function StepNumber({ n }: { n: number }) {
  return (
    <div className="flex-shrink-0 w-8 h-8 rounded-full border-2 border-gray-700 flex items-center justify-center text-gray-500 font-bold text-sm">
      {n}
    </div>
  )
}

function PopulatePoolStep({ leagueId, n }: { leagueId: string; n: number }) {
  const { apiFetch } = useApi()
  const [running, setRunning] = useState(false)

  const handleRun = async () => {
    setRunning(true)
    try {
      const result = await apiFetch<{
        totalScraped: number
        inserted: number
        updated: number
      }>(`/api/leagues/${leagueId}/players/populate-pool`, { method: 'POST' })
      toast.success(
        `Player pool: ${result.totalScraped} scraped · ${result.inserted} new · ${result.updated} updated`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Player pool population failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="p-5 flex items-start gap-4">
      <StepNumber n={n} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-white">Populate player pool</div>
        <p className="text-sm text-gray-400 mt-1">
          Scrapes Her Hoop Stats for the full WNBA player pool with current
          salaries. Safe to re-run — updates existing rows instead of duplicating.
        </p>
      </div>
      <button
        onClick={handleRun}
        disabled={running}
        className="flex-shrink-0 px-3 py-1.5 text-sm bg-green-500 hover:bg-green-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-semibold rounded-lg transition-colors whitespace-nowrap"
      >
        {running ? 'Scraping…' : 'Populate pool'}
      </button>
    </div>
  )
}

