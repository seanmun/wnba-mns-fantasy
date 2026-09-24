import { useEffect, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { AssistantChat, Button } from '../ui/components'
import { useApi } from '../hooks/useApi'
import { BUMP_SUGGESTIONS, useBumper } from '../hooks/useBumper'
import { StrategyDials } from './StrategyDials'

interface TeamRow {
  id: string
  aiPrefs?: Record<string, unknown>
  owners: Array<{ userId: string | null }>
}

// Bump docked beside the page on a desktop: the same chat as the phone
// sheet, with the team's strategy dials right where the advice comes
// from — nudge one, save, and the very next answer follows it. The
// dials only appear for a member who owns a team in this league; the
// API returns ai_prefs for the caller's own team and no one else's.
export function BumperPanel({
  leagueId,
  onClose,
}: {
  leagueId: string
  onClose: (acted: boolean) => void
}) {
  const { apiFetch } = useApi()
  const { user } = useUser()
  const { send, tts, acted } = useBumper(leagueId)
  const [team, setTeam] = useState<TeamRow | null>(null)
  const [ai, setAi] = useState<Record<string, unknown>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    apiFetch<TeamRow[]>(`/api/leagues/${leagueId}/teams`)
      .then((teams) => {
        const mine = teams.find((t) => t.owners.some((o) => o.userId === user.id)) ?? null
        setTeam(mine)
        setAi(mine?.aiPrefs ?? {})
      })
      .catch(() => setTeam(null))
  }, [apiFetch, leagueId, user])

  const save = async () => {
    if (!team) return
    setSaving(true)
    try {
      await apiFetch(`/api/leagues/${leagueId}/teams`, {
        method: 'PATCH',
        body: JSON.stringify({ teamId: team.id, aiPrefs: ai }),
      })
      setDirty(false)
      toast.success("Saved — Bump's advice follows your dials now")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside
      aria-label="Ask Bump"
      className="flex h-full min-h-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-background)]"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent)]">Ask Bump</div>
          <div className="text-xs text-[var(--color-muted-foreground)]">
            Reads your league. Acts with your login.
          </div>
        </div>
        <Button variant="quiet" aria-label="Close Bump" onClick={() => onClose(acted)}>
          <X aria-hidden />
        </Button>
      </div>
      {team ? (
        <div className="px-4 pb-3 border-b border-[var(--color-border)]">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-1.5">
            Your dials
          </div>
          <StrategyDials
            compact
            value={ai}
            onChange={(next) => {
              setAi(next)
              setDirty(true)
            }}
            dirty={dirty}
            saving={saving}
            onSave={() => void save()}
          />
        </div>
      ) : null}
      <AssistantChat
        send={send}
        tts={tts}
        suggestions={BUMP_SUGGESTIONS}
        placeholder="Ask Bump about your league…"
      />
    </aside>
  )
}
