import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useApi } from '../hooks/useApi'
import { Button, EmptyState, ListRow, PageHeader, Skeleton } from '../ui/components'

interface PlayerAvg {
  gp: number
  ppg: number
  rpg: number
  apg: number
  spg: number
  bpg: number
  tpg: number
  fgPct: number
}
interface WirePlayer {
  id: string
  name: string
  position: string | null
  teamCode: string | null
  salary: number | null
  avg: PlayerAvg | null
}
interface WireState {
  myTeamId: string | null
  window: 'open' | 'waivers'
  firstTip: string | null
  clearsOn: string
  priority: Array<{ position: number; teamName: string; isMe: boolean }>
  myRoster: WirePlayer[]
  freeAgents: WirePlayer[]
  myClaim: { addNames: string[]; dropName: string; clearsOn: string } | null
  log: Array<{
    teamName: string
    status: string
    granted: string | null
    dropped: string | null
    reason: string | null
  }>
}

const fmtSalary = (n: number | null) => (n != null ? `$${(n / 1000).toFixed(0)}k` : '')
const fmtAvg = (a: PlayerAvg | null) =>
  a && a.gp > 0
    ? `${a.gp}g · ${a.ppg}p ${a.rpg}r ${a.apg}a · ${a.fgPct}% FG`
    : 'no games on file'

// Free agency, two gears set by the day's real schedule: OPEN until
// the first tipoff (pick one, name the drop, it's instant), then
// waivers — ordered wish list, clears tomorrow morning, longest-since-
// last-granted-move first. One claim per team per day; resubmitting
// replaces.
export function FreeAgents() {
  const { leagueId = '' } = useParams()
  const { apiFetch } = useApi()
  const [state, setState] = useState<WireState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adds, setAdds] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<'ppg' | 'rpg' | 'apg' | 'salary'>('ppg')
  const [drop, setDrop] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    apiFetch<WireState>(`/api/leagues/${leagueId}/waivers`)
      .then(setState)
      .catch((e: Error) => setError(e.message))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [leagueId])

  if (error) return <EmptyState title="Something went wrong">{error}</EmptyState>
  if (!state) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-2">
        <Skeleton h="2.2rem" w="55%" />
        <Skeleton h="3.4rem" />
        <Skeleton h="3.4rem" />
      </div>
    )
  }

  const open = state.window === 'open'
  // Open window: one player at a time, the move is instant. Waivers:
  // build the ordered wish list.
  const toggleAdd = (id: string) =>
    setAdds((a) =>
      a.includes(id) ? a.filter((x) => x !== id) : open ? [id] : [...a, id]
    )
  const move = (i: number, d: number) =>
    setAdds((a) => {
      const t = i + d
      if (t < 0 || t >= a.length) return a
      const next = [...a]
      ;[next[i], next[t]] = [next[t], next[i]]
      return next
    })

  const submit = async () => {
    if (!drop || adds.length === 0) return
    setBusy(true)
    try {
      await apiFetch(`/api/leagues/${leagueId}/waivers`, {
        method: 'POST',
        body: JSON.stringify({ addPlayerIds: adds, dropPlayerId: drop }),
      })
      toast.success(open ? 'Done — they\'re yours' : 'Claim in — clears tomorrow morning')
      setAdds([])
      setDrop(null)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async () => {
    setBusy(true)
    try {
      await apiFetch(`/api/leagues/${leagueId}/waivers`, { method: 'DELETE' })
      toast.success('Claim withdrawn')
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const nameOf = (id: string) => state.freeAgents.find((p) => p.id === id)?.name ?? id

  return (
    <div className="max-w-2xl mx-auto px-4 py-2 pb-24">
      <PageHeader
        back={`/league/${leagueId}`}
        backLabel="League home"
        title="Free agents"
        status={
          state.window === 'open'
            ? `Free agency is OPEN — moves are instant until first tip${state.firstTip ? ` (${new Date(state.firstTip).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET)` : ''}.`
            : 'Games are on — claims queue and clear tomorrow at 8am ET, longest-since-last-move first.'
        }
      />

      {/* Waiver order — public, that's the strategy */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {state.priority.map((p) => (
          <span
            key={p.position}
            className={
              'text-xs rounded-full px-2.5 py-1 border ' +
              (p.isMe
                ? 'border-[var(--color-accent)] text-[var(--color-accent)] font-bold'
                : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]')
            }
          >
            {p.position}. {p.teamName}
          </span>
        ))}
      </div>

      {state.myClaim ? (
        <div className="mb-4 rounded-lg border border-[var(--color-accent)] bg-mns-card p-3 text-sm">
          <b>Pending claim</b> — add {state.myClaim.addNames.join(' → ')} · drop{' '}
          {state.myClaim.dropName} · clears {state.myClaim.clearsOn}
          <div className="mt-2">
            <Button variant="quiet" onClick={withdraw} disabled={busy}>
              Withdraw
            </Button>
          </div>
        </div>
      ) : null}

      {state.myTeamId && adds.length > 0 ? (
        <div className="fixed left-0 right-0 bottom-16 z-40 bg-[var(--color-background)] border-t border-[var(--color-border-interactive)] px-4 py-3 flex flex-col gap-2 max-h-[45vh] overflow-y-auto">
          <span className="text-sm">
            <b>Adding:</b> {adds.map(nameOf).join(' → ')}
          </span>
          {adds.length > 1 ? (
            <span className="text-xs text-[var(--color-muted-foreground)]">
              Order matters — you get the first name still available.{' '}
              {adds.map((id, i) => (
                <span key={id} className="inline-flex items-center gap-0.5 mr-2">
                  {i + 1}.{nameOf(id)}
                  <button onClick={() => move(i, -1)} aria-label="Earlier" className="px-1 min-h-[2rem]">↑</button>
                  <button onClick={() => move(i, 1)} aria-label="Later" className="px-1 min-h-[2rem]">↓</button>
                </span>
              ))}
            </span>
          ) : null}
          <span className="text-sm font-bold">{drop ? 'Dropping:' : 'Now pick who to drop:'}</span>
          <div className="flex flex-wrap gap-1.5">
            {state.myRoster.map((p) => (
              <button
                key={p.id}
                onClick={() => setDrop(drop === p.id ? null : p.id)}
                className={
                  'text-sm rounded-full px-3 py-1.5 border min-h-[2.75rem] ' +
                  (drop === p.id
                    ? 'border-[var(--color-pick-loss,#ff453a)] text-[var(--color-pick-loss,#ff453a)] font-bold'
                    : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]')
                }
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={submit} disabled={busy || !drop}>
              {busy ? 'Working…' : open ? 'Add now' : 'Submit claim'}
            </Button>
            <Button variant="quiet" onClick={() => { setAdds([]); setDrop(null) }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Available
        </h2>
        <div className="flex gap-1">
          {(
            [
              ['ppg', 'Pts'],
              ['rpg', 'Reb'],
              ['apg', 'Ast'],
              ['salary', '$'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSortBy(k)}
              aria-pressed={sortBy === k}
              className={
                'text-xs rounded-full px-2.5 min-h-[2.25rem] border ' +
                (sortBy === k
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)] font-bold'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]')
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 mb-6">
        {[...state.freeAgents]
          .sort((a, b) =>
            sortBy === 'salary'
              ? (b.salary ?? 0) - (a.salary ?? 0)
              : (b.avg?.[sortBy] ?? 0) - (a.avg?.[sortBy] ?? 0)
          )
          .slice(0, 80)
          .map((p) => (
          <li key={p.id}>
            <ListRow
              title={p.name}
              sub={`${[p.position, p.teamCode, fmtSalary(p.salary)].filter(Boolean).join(' · ')} — ${fmtAvg(p.avg)}`}
              end={
                state.myTeamId ? (
                  <Button
                    variant={adds.includes(p.id) ? 'primary' : 'quiet'}
                    onClick={() => toggleAdd(p.id)}
                  >
                    {adds.includes(p.id) ? `#${adds.indexOf(p.id) + 1}` : 'Add'}
                  </Button>
                ) : undefined
              }
            />
          </li>
        ))}
      </ul>

      {state.myTeamId ? (
        <>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
            Your roster — pick the drop
          </h2>
          <ul className="flex flex-col gap-1.5 mb-6">
            {state.myRoster.map((p) => (
              <li key={p.id}>
                <ListRow
                  mine={drop === p.id}
                  title={p.name}
                  sub={[p.position, p.teamCode, fmtSalary(p.salary)].filter(Boolean).join(' · ')}
                  end={
                    <Button
                      variant={drop === p.id ? 'danger' : 'quiet'}
                      onClick={() => setDrop(drop === p.id ? null : p.id)}
                    >
                      {drop === p.id ? 'Dropping' : 'Drop'}
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {state.log.length ? (
        <>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
            Transaction log
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {state.log.map((l, i) => (
              <li key={i} className="rounded bg-mns-card border border-[var(--color-border)] px-3 py-2">
                <b>{l.teamName}</b>{' '}
                {l.status === 'granted' ? (
                  <>
                    added <b className="text-[var(--color-accent)]">{l.granted}</b>, dropped {l.dropped}
                  </>
                ) : (
                  <span className="text-[var(--color-muted-foreground)]">claim failed — {l.reason}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
