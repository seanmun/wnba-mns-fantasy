import { useParams } from 'react-router-dom'
import { BottomTabBar } from '../ui/components'

// The constitution's one nav model: Home · Play · Standings, always
// visible inside a league, current tab lit. mns-ui owns the look.
export function LeagueBottomNav() {
  const { leagueId = '' } = useParams()
  return (
    <BottomTabBar
      basePath={`/league/${leagueId}`}
      playLabel="My Team"
      playPath="my-team"
    />
  )
}
