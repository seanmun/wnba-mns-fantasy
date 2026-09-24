import { useParams } from 'react-router-dom'
import { House, Users, Swords, UserPlus } from 'lucide-react'
import { AssistantChat, BottomTabBar, Sheet } from '../ui/components'
import { BUMP_SUGGESTIONS, useBumper } from '../hooks/useBumper'

// The constitution's one nav model — Home · My Team · Matchup ·
// Players — with Ask Bump in the center. On a phone Ask opens the
// sheet here; on a desktop the layout docks Bump beside the page
// instead (`docked`), so Ask just toggles that panel and no sheet is
// rendered. Closing the sheet reloads so anything Bump changed
// (lineups, claims, trades) is what the page shows.
export function LeagueBottomNav({
  askOpen,
  setAskOpen,
  docked,
}: {
  askOpen: boolean
  setAskOpen: (open: boolean) => void
  docked: boolean
}) {
  const { leagueId = '' } = useParams()
  const { send, tts, acted } = useBumper(leagueId)

  return (
    <>
      <BottomTabBar
        basePath={`/league/${leagueId}`}
        playLabel="My Team"
        playPath="my-team"
        standingsLabel="Players"
        standingsPath="free-agents"
        onAsk={() => setAskOpen(docked ? !askOpen : true)}
        askLabel="Ask Bump"
        icons={{ home: <House />, play: <Users />, standings: <UserPlus /> }}
        extraTab={{ path: 'matchup', label: 'Matchup', icon: <Swords /> }}
      />
      {docked ? null : (
        <Sheet
          open={askOpen}
          label="Ask Bump"
          onClose={() => {
            setAskOpen(false)
            if (acted) window.location.reload()
          }}
        >
          <AssistantChat
            send={send}
            tts={tts}
            suggestions={BUMP_SUGGESTIONS}
            placeholder="Ask Bump about your league…"
          />
        </Sheet>
      )}
    </>
  )
}
