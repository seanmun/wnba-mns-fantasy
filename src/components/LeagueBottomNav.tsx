import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { House, Users, Swords, UserPlus } from 'lucide-react'
import { AssistantChat, BottomTabBar, Sheet } from '../ui/components'

const HUB = import.meta.env.VITE_PLATFORM_URL || 'https://mnsfantasy.com'

const SUGGESTIONS = [
  'Set my lineup for tonight',
  "What's my matchup score?",
  'Who are the best available players under the cap?',
]

// The constitution's one nav model — Home · My Team · Matchup ·
// Players — with Ask Bump in the center. The agent runs in the hub,
// acts with this member's own session, and already knows which league
// is on screen. Closing the sheet reloads so anything Bump changed
// (lineups, claims, trades) is what the page shows.
export function LeagueBottomNav() {
  const { leagueId = '' } = useParams()
  const { getToken } = useAuth()
  const [askOpen, setAskOpen] = useState(false)
  const [actedInChat, setActedInChat] = useState(false)

  const tts = async (text: string): Promise<Blob | null> => {
    const token = await getToken()
    const res = await fetch(`${HUB}/api/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text }),
    })
    return res.ok ? res.blob() : null
  }

  const send = async (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    const token = await getToken()
    const res = await fetch(`${HUB}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages, context: { game: 'wnba', leagueId } }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
    setActedInChat(true)
    return (body as { reply: string }).reply
  }

  return (
    <>
      <BottomTabBar
        basePath={`/league/${leagueId}`}
        playLabel="My Team"
        playPath="my-team"
        standingsLabel="Players"
        standingsPath="free-agents"
        onAsk={() => setAskOpen(true)}
        askLabel="Ask Bump"
        icons={{ home: <House />, play: <Users />, standings: <UserPlus /> }}
        extraTab={{ path: 'matchup', label: 'Matchup', icon: <Swords /> }}
      />
      <Sheet
        open={askOpen}
        label="Ask Bump"
        onClose={() => {
          setAskOpen(false)
          // Bump may have moved lineups or queued claims — the page
          // behind the sheet must tell the truth when it slides away.
          if (actedInChat) window.location.reload()
        }}
      >
        <AssistantChat
          send={send}
          tts={tts}
          suggestions={SUGGESTIONS}
          placeholder="Ask Bump about your league…"
        />
      </Sheet>
    </>
  )
}
