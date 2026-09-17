import { Link, useParams } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { useLeague } from '../contexts/LeagueContext'
import { CommissionerChecklist } from '../components/CommissionerChecklist'
import { EmptyState } from '../ui/components'

// The manager's portal: every LM tool in one place, off the member
// screens. The setup checklist lives here; the quick links cover the
// tools it doesn't walk through.
export function LeagueManagerHub() {
  const { leagueId = '' } = useParams()
  const { user } = useUser()
  const { userLeagues, loading } = useLeague()
  const league = userLeagues.find((l) => l.id === leagueId)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-500 border-r-transparent" />
      </div>
    )
  }
  if (!league) return <EmptyState title="League not found">Check the link.</EmptyState>
  if (league.commissionerId !== user?.id) {
    return (
      <EmptyState title="Commissioner only">
        The LM tools belong to whoever runs the league.
      </EmptyState>
    )
  }

  const base = `/league/${leagueId}/lm`
  const links: Array<[string, string, string]> = [
    ['League settings', `${base}/league`, 'Cap, fees, schedule, scoring overrides'],
    ['Teams & owners', `${base}/teams`, 'Add teams, invite owners'],
    ['Rosters', `${base}/rosters`, 'Assign players by hand'],
    ['Roster import', `${base}/roster-import`, 'CSV bulk import'],
    ['Rookie picks', `${base}/rookie-picks`, 'The rookie draft board'],
    ['Draft setup', `${base}/draft-setup`, 'Pace, readiness, create the draft'],
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-24">
      <h1 className="text-3xl font-bold mb-1">League manager</h1>
      <p className="text-sm text-[var(--color-muted-foreground)] mb-6">{league.name}</p>

      <div className="grid sm:grid-cols-2 gap-2 mb-8">
        {links.map(([label, to, desc]) => (
          <Link
            key={to}
            to={to}
            className="bg-mns-card hover:bg-mns-hover border border-[var(--color-border)] rounded-lg px-4 py-3"
          >
            <b className="block">{label}</b>
            <span className="text-sm text-[var(--color-muted-foreground)]">{desc}</span>
          </Link>
        ))}
      </div>

      <CommissionerChecklist league={league} onSeasonStarted={() => window.location.reload()} />
    </div>
  )
}
