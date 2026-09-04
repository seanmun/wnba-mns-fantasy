import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth, useUser } from '@clerk/clerk-react'
import { toast } from 'sonner'
import { useApi } from '../hooks/useApi'
import { useLeague } from '../contexts/LeagueContext'

// The draft room. The HUB owns the draft — order, clock, board, queues —
// and this page talks to it directly with the member's own session
// (shared Clerk instance). This app's API is only touched for two
// things: finding the draftId, and syncing finished picks into rosters.
// Ported from golf's PoolDraft, the proven integration.

const HUB = import.meta.env.VITE_PLATFORM_URL || 'https://mnsfantasy.com'

interface DraftState {
  draft: {
    id: string
    name: string
    status: 'setup' | 'active' | 'paused' | 'complete' | 'cancelled'
    rounds: number
    pickSeconds: number | null
    slowPickHours: number
    currentOverall: number | null
    currentDeadline: string | null
    createdBy: string
  }
  participants: Array<{ id: string; userId: string; teamName: string; slot: number }>
  board: Array<{
    overall: number
    round: number
    pickInRound: number
    participantId: string
    madeAt: string | null
    isAuto: boolean
    item: { id: string; name: string; meta: Record<string, unknown> | null } | null
  }>
  myQueue: string[]
  myAutodraft: boolean
  current: { overall: number; round: number; pickInRound: number; participantId: string } | null
  onTheClock: { id: string; teamName: string; userId: string } | null
  isMyTurn: boolean
  available: Array<{
    id: string
    name: string
    rankHint: number | null
    meta: Record<string, unknown> | null
  }>
}

function useCountdown(deadline: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!deadline) return null
  const ms = new Date(deadline).getTime() - now
  if (ms <= 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}h ${m}m` : `${m}:${String(s).padStart(2, '0')}`
}

function playerMeta(meta: Record<string, unknown> | null): string {
  if (!meta) return ''
  const bits = [meta.position, meta.teamCode].filter(Boolean)
  const salary = typeof meta.salary === 'number' ? `$${meta.salary.toLocaleString()}` : null
  return [...bits, salary].filter(Boolean).join(' · ')
}

export function Draft() {
  const { leagueId = '' } = useParams()
  const { user } = useUser()
  const { getToken } = useAuth()
  const { apiFetch } = useApi()
  const { currentLeague } = useLeague()
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  // Mobile: columns become tabs so the queue isn't buried under the pool.
  const [mobileTab, setMobileTab] = useState<'draft' | 'queue' | 'team'>('draft')
  const expiredFor = useRef<number | null>(null)

  const isCommissioner = !!user?.id && currentLeague?.commissionerId === user.id

  const { data: draftRef, refetch: refetchRef } = useQuery({
    queryKey: ['league-draft', leagueId],
    queryFn: () =>
      apiFetch<{ draftId: string | null; status: string | null }>(
        `/api/leagues/${leagueId}/draft`
      ),
  })
  const draftId = draftRef?.draftId ?? null

  const hubFetch = async (path: string, init?: RequestInit) => {
    const token = await getToken()
    const res = await fetch(`${HUB}/api/draft${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`)
    return body
  }

  const { data: state, refetch } = useQuery<DraftState>({
    queryKey: ['draft-state', draftId],
    enabled: !!draftId,
    queryFn: () => hubFetch(`/${draftId}`) as Promise<DraftState>,
    // Fast enough to feel live during a timed draft.
    refetchInterval: 5000,
  })

  const countdown = useCountdown(state?.draft.currentDeadline ?? null)

  // A 2-minute clock can't wait for the hub's hourly cron, so whoever is
  // watching nudges the auto-pick once a deadline visibly passes.
  useEffect(() => {
    if (!state || state.draft.status !== 'active' || !state.draft.currentDeadline) return
    const overall = state.draft.currentOverall
    if (overall == null || expiredFor.current === overall) return
    const ms = new Date(state.draft.currentDeadline).getTime() - Date.now()
    if (ms > 0) return
    expiredFor.current = overall
    void (async () => {
      try {
        const token = await getToken()
        await fetch(`${HUB}/api/cron/draft-clock?draftId=${state.draft.id}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        void refetch()
      } catch {
        /* the cron will catch it */
      }
    })()
  }, [state, getToken, refetch])

  // Rosters save themselves the moment the board finishes.
  const savedFor = useRef<string | null>(null)
  useEffect(() => {
    if (state?.draft.status !== 'complete') return
    if (savedFor.current === state.draft.id) return
    savedFor.current = state.draft.id
    void apiFetch(`/api/leagues/${leagueId}/draft`, {
      method: 'POST',
      body: JSON.stringify({ action: 'sync' }),
    }).catch(() => {
      /* the commissioner can still trigger sync from setup */
    })
  }, [state?.draft.status, state?.draft.id, leagueId, apiFetch])

  const teamById = useMemo(
    () => new Map((state?.participants ?? []).map((p) => [p.id, p])),
    [state?.participants]
  )

  const myPicks = useMemo(() => {
    if (!state || !user) return []
    const me = state.participants.find((p) => p.userId === user.id)
    if (!me) return []
    return state.board.filter((b) => b.participantId === me.id && b.item)
  }, [state, user])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = state?.available ?? []
    return q ? list.filter((i) => i.name.toLowerCase().includes(q)) : list
  }, [state?.available, search])

  const leagueAction = async (action: string) => {
    setBusy(true)
    try {
      const r = await apiFetch<Record<string, unknown>>(`/api/leagues/${leagueId}/draft`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      })
      toast.success(action === 'create' ? 'Draft created' : action === 'sync' ? 'Rosters updated' : 'Done')
      await refetchRef()
      await refetch()
      return r
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const pick = async (itemId: string) => {
    setBusy(true)
    try {
      await hubFetch(`/${draftId}/pick`, { method: 'POST', body: JSON.stringify({ itemId }) })
      await refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Pick failed')
    } finally {
      setBusy(false)
    }
  }

  const queue = state?.myQueue ?? []
  const queuedSet = new Set(queue)

  const saveQueue = async (itemIds: string[]) => {
    try {
      await hubFetch(`/${draftId}/queue`, { method: 'POST', body: JSON.stringify({ itemIds }) })
      await refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Queue update failed')
    }
  }

  const toggleQueued = (itemId: string) =>
    saveQueue(queuedSet.has(itemId) ? queue.filter((q) => q !== itemId) : [...queue, itemId])

  const moveQueued = (index: number, delta: number) => {
    const next = [...queue]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    void saveQueue(next)
  }

  const setAutodraft = async (enabled: boolean) => {
    try {
      await hubFetch(`/${draftId}/queue`, {
        method: 'POST',
        body: JSON.stringify({ autodraft: enabled }),
      })
      toast.success(enabled ? 'Autodraft on' : 'Autodraft off')
      await refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  if (!draftRef) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-500 border-r-transparent" />
      </div>
    )
  }

  if (!draftId) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-bold mb-2">Draft</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mb-5">
          {isCommissioner
            ? 'Create the draft once every team has a signed-up owner. Order follows team creation order.'
            : "The commissioner hasn't created the draft yet."}
        </p>
        {isCommissioner && (
          <button
            onClick={() => leagueAction('create')}
            disabled={busy}
            className="px-5 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50 bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
          >
            {busy ? 'Creating…' : 'Create draft'}
          </button>
        )}
      </div>
    )
  }

  if (!state) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-500 border-r-transparent" />
      </div>
    )
  }

  const { draft } = state

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24">
      <div className="mb-5">
        <Link to={`/league/${leagueId}`} className="text-xs text-[var(--color-muted-foreground)]">
          ← {currentLeague?.name ?? 'League home'}
        </Link>
        <h1 className="text-3xl font-bold mt-1">Draft</h1>
      </div>

      {/* ── Status bar ── */}
      <div
        className={
          'rounded-xl border p-4 mb-5 flex flex-wrap items-center justify-between gap-3 ' +
          (state.isMyTurn
            ? 'bg-[var(--color-accent-soft)] border-[var(--color-accent)]'
            : 'bg-mns-card border-[var(--color-border)]')
        }
      >
        <div>
          {draft.status === 'setup' && (
            <span className="text-[var(--color-muted-foreground)]">
              Ready to start · {state.participants.length} teams · {draft.rounds} rounds
            </span>
          )}
          {draft.status === 'active' && (
            <>
              <div className="text-sm text-[var(--color-muted-foreground)]">
                Round {state.current?.round} · Pick {state.current?.pickInRound}
              </div>
              <div className="text-lg font-semibold">
                {state.isMyTurn
                  ? "You're on the clock"
                  : `${state.onTheClock?.teamName ?? '—'} is picking`}
              </div>
            </>
          )}
          {draft.status === 'paused' && (
            <span className="font-semibold text-[var(--color-key,#ffb000)]">Paused</span>
          )}
          {draft.status === 'complete' && (
            <span className="font-semibold text-[var(--color-accent)]">
              Draft complete — rosters saved
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {draft.status === 'active' && countdown && (
            <span className="font-mono text-xl tabular-nums">{countdown}</span>
          )}
          {isCommissioner && draft.status === 'setup' && (
            <button
              onClick={() => leagueAction('start')}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-bold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] disabled:opacity-50"
            >
              Start draft
            </button>
          )}
          {isCommissioner && draft.status === 'active' && (
            <button
              onClick={() => leagueAction('pause')}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs border border-[var(--color-border)]"
            >
              Pause
            </button>
          )}
          {isCommissioner && draft.status === 'paused' && (
            <>
              <button
                onClick={() => leagueAction('resume')}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
              >
                Resume
              </button>
              <button
                onClick={() => {
                  if (confirm('Restart wipes the whole board and every drafted roster. Sure?'))
                    void leagueAction('restart')
                }}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs border border-[var(--color-pick-loss,#ff453a)] text-[var(--color-pick-loss,#ff453a)]"
              >
                Restart
              </button>
            </>
          )}
          {/* Autodraft: my queue (then best available) picks for me. */}
          {draft.status !== 'complete' && (
            <button
              onClick={() => setAutodraft(!state.myAutodraft)}
              className={
                'px-3 py-1.5 rounded-lg text-xs border ' +
                (state.myAutodraft
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)] font-bold'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]')
              }
            >
              Autodraft {state.myAutodraft ? 'ON' : 'off'}
            </button>
          )}
        </div>
      </div>

      {/* ── Mobile tabs ── */}
      <div className="flex gap-2 mb-4 lg:hidden">
        {(
          [
            ['draft', 'Draft'],
            ['queue', `Queue (${queue.length})`],
            ['team', `My team (${myPicks.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMobileTab(key)}
            aria-pressed={mobileTab === key}
            className={
              'flex-1 min-h-[2.75rem] rounded-lg border text-sm font-bold ' +
              (mobileTab === key
                ? 'bg-[var(--color-foreground)] text-[var(--color-background)] border-[var(--color-foreground)]'
                : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]')
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* ── Left: board + available ── */}
        <div className={mobileTab !== 'draft' ? 'hidden lg:block' : ''}>
          {/* Recent picks strip */}
          {draft.status !== 'setup' && (
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {state.board
                .filter((b) => b.item)
                .slice(-8)
                .reverse()
                .map((b) => (
                  <div
                    key={b.overall}
                    className="shrink-0 rounded-lg border border-[var(--color-border)] bg-mns-card px-3 py-1.5 text-xs"
                  >
                    <span className="text-[var(--color-muted-foreground)]">
                      {b.round}.{b.pickInRound} {teamById.get(b.participantId)?.teamName ?? ''}
                    </span>
                    <span className="block font-semibold">
                      {b.item!.name}
                      {b.isAuto ? (
                        <span className="ml-1 text-[0.65rem] uppercase text-[var(--color-muted-foreground)]">
                          auto
                        </span>
                      ) : null}
                    </span>
                  </div>
                ))}
            </div>
          )}

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players…"
            className="w-full mb-3 px-4 py-2.5 rounded-lg bg-mns-card border border-[var(--color-border)] text-[var(--color-foreground)]"
          />

          <ul className="flex flex-col gap-1.5">
            {filtered.slice(0, 60).map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-mns-card px-3 py-2"
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">{p.name}</span>
                  <span className="block text-xs text-[var(--color-muted-foreground)]">
                    {playerMeta(p.meta)}
                  </span>
                </span>
                <button
                  onClick={() => toggleQueued(p.id)}
                  className={
                    'px-3 py-1.5 rounded-lg text-xs border min-h-[2.5rem] ' +
                    (queuedSet.has(p.id)
                      ? 'border-[var(--color-accent)] text-[var(--color-accent)] font-bold'
                      : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]')
                  }
                >
                  {queuedSet.has(p.id) ? 'Queued' : 'Queue'}
                </button>
                {state.isMyTurn && (
                  <button
                    onClick={() => pick(p.id)}
                    disabled={busy}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold min-h-[2.5rem] bg-[var(--color-accent)] text-[var(--color-accent-foreground)] disabled:opacity-50"
                  >
                    Draft
                  </button>
                )}
              </li>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-[var(--color-muted-foreground)] py-6 text-center">
                No available players match.
              </p>
            )}
          </ul>
        </div>

        {/* ── Right: queue + my team ── */}
        <div className="flex flex-col gap-6">
          <section className={mobileTab !== 'queue' ? 'hidden lg:block' : ''}>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
              My queue
            </h2>
            {queue.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Queue players and autodraft picks from the top when you're away.
              </p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {queue.map((id, i) => {
                  const item =
                    state.available.find((a) => a.id === id) ??
                    ({ name: '(drafted)', meta: null } as { name: string; meta: null })
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-mns-card px-3 py-1.5 text-sm"
                    >
                      <span className="w-5 text-[var(--color-muted-foreground)] tabular-nums">
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate font-medium">{item.name}</span>
                      <button onClick={() => moveQueued(i, -1)} aria-label="Move up" className="px-1.5 text-[var(--color-muted-foreground)]">
                        ▲
                      </button>
                      <button onClick={() => moveQueued(i, 1)} aria-label="Move down" className="px-1.5 text-[var(--color-muted-foreground)]">
                        ▼
                      </button>
                      <button onClick={() => toggleQueued(id)} aria-label="Remove" className="px-1.5 text-[var(--color-pick-loss,#ff453a)]">
                        ✕
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <section className={mobileTab !== 'team' ? 'hidden lg:block' : ''}>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
              My picks
            </h2>
            {myPicks.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">Nothing yet.</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {myPicks.map((b) => (
                  <li
                    key={b.overall}
                    className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-mns-card px-3 py-1.5 text-sm"
                  >
                    <span className="w-8 text-[var(--color-muted-foreground)] tabular-nums">
                      R{b.round}
                    </span>
                    <span className="flex-1 truncate font-medium">{b.item!.name}</span>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {playerMeta(b.item!.meta)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Full order, so everyone can see the snake */}
          <section className="hidden lg:block">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">
              Order
            </h2>
            <ol className="flex flex-col gap-1 text-sm">
              {state.participants
                .slice()
                .sort((a, b) => a.slot - b.slot)
                .map((p) => (
                  <li
                    key={p.id}
                    className={
                      'flex items-center gap-2 rounded px-2 py-1 ' +
                      (state.onTheClock?.id === p.id
                        ? 'bg-[var(--color-accent-soft)] font-bold'
                        : '')
                    }
                  >
                    <span className="w-5 text-[var(--color-muted-foreground)] tabular-nums">
                      {p.slot}
                    </span>
                    {p.teamName}
                  </li>
                ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}
