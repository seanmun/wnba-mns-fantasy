import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useApi } from '../hooks/useApi'
import { Plus } from 'lucide-react'
import { Button, EmptyState, ListRow, PageHeader, Skeleton } from '../ui/components'
import { PlayerName } from '../components/InjuryTag'
import { RangeChips, StatTable, type RangeKey, type StatAvg } from '../components/StatTable'
import { PlayerCard } from '../components/PlayerCard'

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
  injuryStatus?: string | null
  injuryUpdatedAt?: string | null
  avg: PlayerAvg | null
}
interface WireState {
  myTeamId: string | null
  activeSize: number
  window: 'open' | 'waivers'
  firstTip: string | null
  clearsOn: string
  priority: Array<{ position: number; teamName: string; isMe: boolean }>
  myRoster: WirePlayer[]
  freeAgents: WirePlayer[]
  myClaims: Array<{ id: string; addNames: string[]; dropName: string | null; clearsOn: string }>
  log: Array<{
    teamName: string
    status: string
    granted: string | null
    dropped: string | null
    reason: string | null
  }>
}

const fmtSalary = (n: number | null) => (n != null ? `$${(n / 1000).toFixed(0)}k` : '')

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
  const [ranges, setRanges] = useState<Record<string, Record<string, StatAvg> | null> | null>(null)
  const [range, setRange] = useState<RangeKey>('season')
  const [search, setSearch] = useState('')
  const [cardId, setCardId] = useState<string | null>(null)
  const [drop, setDrop] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    apiFetch<WireState>(`/api/leagues/${leagueId}/waivers`)
      .then(setState)
      .catch((e: Error) => setError(e.message))
    apiFetch<Record<string, Record<string, StatAvg> | null>>(`/api/leagues/${leagueId}/stats`)
      .then(setRanges)
      .catch(() => setRanges({}))
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
  // One player per move, both gears: open executes now, waivers append
  // a claim to your queue — the queue is where order lives.
  const toggleAdd = (id: string) => setAdds((a) => (a.includes(id) ? [] : [id]))

  const submit = async () => {
    if (adds.length === 0) return
    setBusy(true)
    try {
      await apiFetch(`/api/leagues/${leagueId}/waivers`, {
        method: 'POST',
        body: JSON.stringify({ addPlayerIds: adds, dropPlayerId: drop ?? undefined }),
      })
      toast.success(open ? 'Done — they\'re yours' : 'Claim queued — clears tomorrow morning')
      setAdds([])
      setDrop(null)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async (claimId: string) => {
    setBusy(true)
    try {
      await apiFetch(`/api/leagues/${leagueId}/waivers?claimId=${claimId}`, { method: 'DELETE' })
      toast.success('Claim withdrawn')
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const reorder = async (i: number, d: number) => {
    const t = i + d
    if (t < 0 || t >= state.myClaims.length) return
    const ids = state.myClaims.map((c) => c.id)
    ;[ids[i], ids[t]] = [ids[t], ids[i]]
    setBusy(true)
    try {
      await apiFetch(`/api/leagues/${leagueId}/waivers`, {
        method: 'PATCH',
        body: JSON.stringify({ claimIds: ids }),
      })
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

      {state.myClaims.length > 0 ? (
        <div className="mb-4 rounded-lg border border-[var(--color-accent)] bg-mns-card p-3 text-sm">
          <b>Your waiver queue</b> — clears {state.myClaims[0].clearsOn} at 8am ET. Rounds run
          like a snake: everyone's first claim in waiver order, then back the other way.
          <ul className="mt-2 flex flex-col gap-1.5">
            {state.myClaims.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 tabular-nums">
                <span className="font-bold">{i + 1}.</span>
                <span className="flex-1 min-w-0 truncate">
                  {c.addNames.join(' → ')}
                  {c.dropName ? (
                    <span className="text-[var(--color-muted-foreground)]"> · drop {c.dropName}</span>
                  ) : null}
                </span>
                <button onClick={() => reorder(i, -1)} disabled={busy || i === 0} aria-label="Earlier" className="px-2 min-h-[2.25rem] disabled:opacity-30">↑</button>
                <button onClick={() => reorder(i, 1)} disabled={busy || i === state.myClaims.length - 1} aria-label="Later" className="px-2 min-h-[2.25rem] disabled:opacity-30">↓</button>
                <button onClick={() => withdraw(c.id)} disabled={busy} aria-label={`Withdraw ${c.addNames[0]}`} className="px-2 min-h-[2.25rem] text-[var(--color-pick-loss,#ff453a)]">✕</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.myTeamId && adds.length > 0 ? (
        <div className="fixed left-0 right-0 bottom-16 z-40 bg-[var(--color-background)] border-t border-[var(--color-border-interactive)] px-4 py-3 flex flex-col gap-2 max-h-[45vh] overflow-y-auto">
          <span className="text-sm">
            <b>Adding:</b> {adds.map(nameOf).join(' → ')}
          </span>
          <span className="text-sm font-bold">
            {drop
              ? 'Dropping:'
              : state.myRoster.length < state.activeSize
                ? 'Pick a drop, or skip it — you have an open spot:'
                : 'Now pick who to drop:'}
          </span>
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
            <Button
              className="flex-1"
              onClick={submit}
              disabled={busy || (!drop && state.myRoster.length >= state.activeSize)}
            >
              {busy ? 'Working…' : open ? 'Add now' : 'Queue claim'}
            </Button>
            <Button variant="quiet" onClick={() => { setAdds([]); setDrop(null) }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Available
        </h2>
        <RangeChips value={range} onChange={setRange} hasLastSeason={!!ranges?.lastSeason} />
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search players…"
        className="w-full mb-3 px-4 py-2.5 min-h-[3rem] rounded-lg bg-mns-card border border-[var(--color-border-interactive)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:border-[var(--color-accent)]"
      />
      <div className="mb-6">
        <StatTable
          players={[...state.freeAgents]
            .filter((p) => {
              const q = search.trim().toLowerCase()
              if (!q) return true
              return (
                p.name.toLowerCase().includes(q) ||
                (p.teamCode ?? '').toLowerCase().includes(q) ||
                (p.position ?? '').toLowerCase().includes(q)
              )
            })
            .slice(0, 120)}
          stats={ranges?.[range] ?? {}}
          onSelect={(p) => setCardId(p.id)}
          maxSalary={Math.max(
            1,
            ...state.freeAgents.map((p) => p.salary ?? 0),
            ...state.myRoster.map((p) => p.salary ?? 0)
          )}
          action={(p) =>
            state.myTeamId ? (
              <Button
                variant={adds.includes(p.id) ? 'primary' : 'quiet'}
                aria-label={adds.includes(p.id) ? `${p.name} is pick ${adds.indexOf(p.id) + 1}` : `Add ${p.name}`}
                onClick={() => toggleAdd(p.id)}
              >
                {adds.includes(p.id) ? `#${adds.indexOf(p.id) + 1}` : <Plus aria-hidden />}
              </Button>
            ) : null
          }
        />
      </div>

      <PlayerCard leagueId={leagueId} playerId={cardId} ranges={ranges} onClose={() => setCardId(null)} />

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
                  title={<PlayerName name={p.name} injuryStatus={p.injuryStatus} />}
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
