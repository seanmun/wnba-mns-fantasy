import { useParams } from 'react-router-dom'
import { House, Users, Swords, Trophy } from 'lucide-react'
import { BottomTabBar } from '../ui/components'

// The constitution's one nav model: Home · My Team · Matchup ·
// Standings, always visible inside a league, current tab lit. Lucide
// icons passed in — mns-ui carries no icon dependency (same pattern
// as NFL's bar).
export function LeagueBottomNav() {
  const { leagueId = '' } = useParams()
  return (
    <BottomTabBar
      basePath={`/league/${leagueId}`}
      playLabel="My Team"
      playPath="my-team"
      icons={{ home: <House />, play: <Users />, standings: <Trophy /> }}
      extraTab={{ path: 'matchup', label: 'Matchup', icon: <Swords /> }}
    />
  )
}
