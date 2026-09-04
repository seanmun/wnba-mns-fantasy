import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useApi } from '../hooks/useApi'
import { useLeague } from '../contexts/LeagueContext'

interface TeamRow {
  id: string
  name: string
  owners: Array<{ userId: string | null; email: string; displayName: string | null }>
}

// Draft setup, commissioner-side: readiness first (a team with no
// signed-up owner cannot pick), then one Create button. Live controls —
// start, pause, restart — live in the draft room where the board is.
export function AdminDraftSetup() {
  const { leagueId = '' } = useParams()
  const { apiFetch } = useApi()
  const { currentLeague } = useLeague()
  const [teams, setTeams] = useState<TeamRow[] | null>(null)
  const [draftRef, setDraftRef] = useState<{
    draftId: string | null
    status: string | null
    pace?: 'live' | 'slow' | null
  } | null>(null)
  const [poolCount, setPoolCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [pace, setPace] = useState<'live' | 'slow'>('live')

  const refresh = () => {
    void apiFetch<TeamRow[]>(`/api/leagues/${leagueId}/teams`).then(setTeams).catch(() => setTeams([]))
    void apiFetch<{ draftId: string | null; status: string | null }>(`/api/leagues/${leagueId}/draft`)
      .then(setDraftRef)
      .catch(() => setDraftRef({ draftId: null, status: null }))
    void apiFetch<Array<{ teamId: string | null }>>(`/api/leagues/${leagueId}/players`)
      .then((p) => setPoolCount(p.filter((x) => x.teamId == null).length))
      .catch(() => setPoolCount(null))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [leagueId])

  const create = async () => {
    setBusy(true)
    try {
      await apiFetch(`/api/leagues/${leagueId}/draft`, {
        method: 'POST',
        body: JSON.stringify({ action: 'create', pace }),
      })
      toast.success('Draft created')
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (teams == null || draftRef == null) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-500 border-r-transparent" />
      </div>
    )
  }

  const unlinked = teams.filter((t) => !t.owners.some((o) => o.userId != null))
  const rounds = currentLeague?.config.draft?.rounds ?? currentLeague?.config.roster?.activeSize

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-24">
      <Link to={`/league/${leagueId}/lm`} className="text-xs text-[var(--color-muted-foreground)]">
        ← LM hub
      </Link>
      <h1 className="text-3xl font-bold mt-1 mb-6">Draft setup</h1>

      <div className="bg-mns-card border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)] mb-6">
        <div className="p-4 flex items-center justify-between">
          <span>Teams</span>
          <b className="tabular-nums">{teams.length}</b>
        </div>
        <div className="p-4 flex items-center justify-between">
          <span>Owners signed up</span>
          <b className={unlinked.length ? 'text-[var(--color-pick-loss,#ff453a)]' : 'text-[var(--color-accent)]'}>
            {teams.length - unlinked.length}/{teams.length}
          </b>
        </div>
        <div className="p-4 flex items-center justify-between">
          <span>Draftable players</span>
          <b className="tabular-nums">{poolCount ?? '—'}</b>
        </div>
        <div className="p-4 flex items-center justify-between">
          <span>Rounds (from league config)</span>
          <b className="tabular-nums">{rounds ?? '—'}</b>
        </div>
        <div className="p-4 flex items-center justify-between">
          <span>Draft</span>
          <b className={draftRef.draftId ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted-foreground)]'}>
            {draftRef.draftId
              ? `${draftRef.status}${draftRef.pace ? ` · ${draftRef.pace}` : ''}`
              : 'not created'}
          </b>
        </div>
      </div>

      {unlinked.length > 0 && (
        <p className="text-sm text-[var(--color-key,#ffb000)] mb-4">
          Waiting on: {unlinked.map((t) => t.name).join(', ')} — their owners need to sign up with
          the invited email before the draft can start.
        </p>
      )}

      {!draftRef.draftId ? (
        <>
          {/* Pace decides the whole experience: a room everyone sits
              in, or a board that lives in your pocket for days. */}
          <div className="grid sm:grid-cols-2 gap-2 mb-4" role="radiogroup" aria-label="Draft pace">
            {(
              [
                ['live', 'Live draft', '2-minute pick clock. Everyone drafts together in the room.'],
                ['slow', 'Slow draft', '12 hours a pick, no clock pressure. You get an email when you are up; autodraft covers you if time runs out.'],
              ] as const
            ).map(([key, label, desc]) => (
              <button
                key={key}
                role="radio"
                aria-checked={pace === key}
                onClick={() => setPace(key)}
                className={
                  'text-left rounded-lg border-2 p-3 transition-colors ' +
                  (pace === key
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                    : 'border-[var(--color-border)] bg-mns-card')
                }
              >
                <span className="block font-bold">{label}</span>
                <span className="block text-sm text-[var(--color-muted-foreground)]">{desc}</span>
              </button>
            ))}
          </div>
          <button
            onClick={create}
            disabled={busy || teams.length < 2}
            className="w-full min-h-[3rem] rounded-lg font-bold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] disabled:opacity-50"
          >
            {busy ? 'Creating…' : `Create ${pace} draft`}
          </button>
        </>
      ) : (
        <>
          <Link
            to={`/league/${leagueId}/draft`}
            className="block w-full min-h-[3rem] rounded-lg font-bold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] flex items-center justify-center"
          >
            Open the draft room →
          </Link>
          {draftRef.status === 'setup' && (
            <button
              onClick={async () => {
                const next = draftRef.pace === 'slow' ? 'live' : 'slow'
                setBusy(true)
                try {
                  await apiFetch(`/api/leagues/${leagueId}/draft`, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'set_pace', pace: next }),
                  })
                  toast.success(next === 'slow' ? 'Slow draft — 12h a pick' : 'Live draft — 2-minute clock')
                  refresh()
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Failed')
                } finally {
                  setBusy(false)
                }
              }}
              disabled={busy}
              className="w-full mt-2 min-h-[3rem] rounded-lg font-bold border-2 border-[var(--color-border-interactive,var(--color-border))] disabled:opacity-50"
            >
              Switch to {draftRef.pace === 'slow' ? 'live (2-min clock)' : 'slow (12h a pick)'}
            </button>
          )}
        </>
      )}
      <p className="text-xs text-[var(--color-muted-foreground)] mt-3">
        Start, pause and restart live in the draft room. Order is team creation order; autodraft
        picks from each owner's queue when their time runs out. To change pace, restart the draft
        from the room and recreate it here.
      </p>
    </div>
  )
}
