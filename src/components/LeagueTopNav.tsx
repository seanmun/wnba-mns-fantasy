import { Link, useParams } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { useLeague } from '../contexts/LeagueContext'
import { LEAGUE_PHASE_LABELS } from '../types/league'

// League context strip: which league am I in, what phase is it in, and
// the doors the bottom tabs don't cover. Manager tools appear only for
// the commissioner — moderation never shows on member screens.
export function LeagueTopNav() {
  const { leagueId = '' } = useParams()
  const { currentLeague } = useLeague()
  const { user } = useUser()
  const base = `/league/${leagueId}`
  const isCommissioner =
    !!user?.id && currentLeague?.commissionerId === user.id

  return (
    <nav className="bg-mns-card border-b border-[var(--color-border)] px-4 py-2 text-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-baseline gap-2">
          <Link
            to={base}
            className="font-semibold text-[var(--color-foreground)] truncate"
          >
            {currentLeague?.name ?? 'League'}
          </Link>
          {currentLeague ? (
            <span className="shrink-0 text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
              {LEAGUE_PHASE_LABELS[currentLeague.leaguePhase]}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-4 text-[var(--color-muted-foreground)]">
          <Link to={`${base}/free-agents`} className="hover:text-[var(--color-foreground)] transition-colors">
            Free agents
          </Link>
          <Link to={`${base}/trade-machine`} className="hover:text-[var(--color-foreground)] transition-colors">
            Trades
          </Link>
          {isCommissioner ? (
            <Link
              to={`${base}/lm`}
              className="font-semibold text-[var(--color-accent)] hover:opacity-80 transition-opacity"
            >
              Manage
            </Link>
          ) : null}
        </div>
      </div>
    </nav>
  )
}
