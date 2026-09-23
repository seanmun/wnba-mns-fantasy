import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Star } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { Button, EmptyState, ListRow, PageHeader, Skeleton } from '../ui/components'
import { PlayerName } from '../components/InjuryTag'

interface KeeperPlayer {
  id: string
  name: string
  position: string | null
  teamCode: string | null
  salary: number | null
  isKeeper: boolean
  injuryStatus?: string | null
}
interface KeepersPayload {
  phase: string
  maxKeepers: number
  cap: { hardCap: number; base: number } | null
  myTeamId: string | null
  myRoster: KeeperPlayer[]
  declared: Array<{ teamId: string; teamName: string; count: number }>
  isCommissioner: boolean
}

const M = 1_000_000
const fmtM = (n: number) => `$${(n / M).toFixed(2)}M`

// Keeper season: name who survives the turn of the year. Kept salaries
// ride into the new cap; everyone else goes back in the pool when the
// commissioner locks. Editable all phase long — saving replaces.
export function Keepers() {
  const { leagueId = '' } = useParams()
  const { apiFetch } = useApi()
  const [data, setData] = useState<KeepersPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmLock, setConfirmLock] = useState(false)

  const load = () => {
    apiFetch<KeepersPayload>(`/api/leagues/${leagueId}/keepers`)
      .then((d) => {
        setData(d)
        setPicked(d.myRoster.filter((p) => p.isKeeper).map((p) => p.id))
      })
      .catch((e: Error) => setError(e.message))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [apiFetch, leagueId])

  if (error) return <EmptyState title="Something went wrong">{error}</EmptyState>
  if (!data || picked == null) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-2">
        <Skeleton h="2.2rem" w="55%" />
        <Skeleton h="3.4rem" />
        <Skeleton h="3.4rem" />
      </div>
    )
  }

  const inPhase = data.phase === 'keeper_season'
  const keeperSalary = picked.reduce(
    (n, id) => n + (data.myRoster.find((p) => p.id === id)?.salary ?? 0),
    0
  )
  const dirty =
    JSON.stringify([...picked].sort()) !==
    JSON.stringify(data.myRoster.filter((p) => p.isKeeper).map((p) => p.id).sort())

  const toggle = (id: string) =>
    setPicked((cur) => {
      const c = cur ?? []
      if (c.includes(id)) return c.filter((x) => x !== id)
      if (c.length >= data.maxKeepers) {
        toast.error(`This league keeps at most ${data.maxKeepers}.`)
        return c
      }
      return [...c, id]
    })

  const save = async () => {
    setBusy(true)
    try {
      await apiFetch(`/api/leagues/${leagueId}/keepers`, {
        method: 'POST',
        body: JSON.stringify({ playerIds: picked }),
      })
      toast.success(`Keepers saved — ${picked.length} of ${data.maxKeepers}`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  const lock = async () => {
    setBusy(true)
    try {
      const r = await apiFetch<{ released: number }>(`/api/leagues/${leagueId}/keepers`, {
        method: 'POST',
        body: JSON.stringify({ action: 'lock' }),
      })
      toast.success(`Keepers locked — ${r.released} players back in the pool. Draft phase is open.`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lock failed')
    } finally {
      setBusy(false)
      setConfirmLock(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-2 pb-24">
      <PageHeader
        back={`/league/${leagueId}`}
        backLabel="League home"
        title="Keepers"
        status={
          inPhase
            ? `Name up to ${data.maxKeepers} to carry into next season — everyone else returns to the pool at the draft.`
            : 'Keeper declarations open between the rollover and the draft.'
        }
      />

      {data.myTeamId ? (
        <>
          <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-mns-card p-3 text-sm flex items-baseline justify-between tabular-nums">
            <span>
              <b>{picked.length}</b>
              <span className="text-[var(--color-muted-foreground)]"> of {data.maxKeepers} kept</span>
            </span>
            <span>
              <b>{fmtM(keeperSalary)}</b>
              <span className="text-[var(--color-muted-foreground)]">
                {' '}kept salary{data.cap ? ` · ${fmtM(Math.max(0, data.cap.hardCap - keeperSalary))} under the hard cap` : ''}
              </span>
            </span>
          </div>

          <ul className="flex flex-col gap-1.5 mb-4">
            {data.myRoster.map((p) => {
              const kept = picked.includes(p.id)
              return (
                <li key={p.id}>
                  <ListRow
                    mine={kept}
                    title={<PlayerName name={p.name} injuryStatus={p.injuryStatus} />}
                    sub={[p.position, p.teamCode, p.salary != null ? fmtM(p.salary) : null]
                      .filter(Boolean)
                      .join(' · ')}
                    end={
                      inPhase ? (
                        <button
                          onClick={() => toggle(p.id)}
                          aria-pressed={kept}
                          aria-label={kept ? `Release ${p.name}` : `Keep ${p.name}`}
                          className={
                            'inline-flex items-center justify-center w-10 h-10 rounded-full border ' +
                            (kept
                              ? 'border-[var(--color-key,#ffb000)] text-[var(--color-key,#ffb000)]'
                              : 'border-[var(--color-border-interactive)] text-[var(--color-muted-foreground)]')
                          }
                        >
                          <Star aria-hidden className="w-5 h-5" fill={kept ? 'currentColor' : 'none'} />
                        </button>
                      ) : p.isKeeper ? (
                        <Star aria-hidden className="w-5 h-5 text-[var(--color-key,#ffb000)]" fill="currentColor" />
                      ) : undefined
                    }
                  />
                </li>
              )
            })}
          </ul>

          {inPhase ? (
            <Button full onClick={save} disabled={busy || !dirty}>
              {busy ? 'Saving…' : dirty ? `Save keepers (${picked.length})` : 'Saved'}
            </Button>
          ) : null}
        </>
      ) : (
        <EmptyState title="You don't own a team here">Keepers are an owner decision.</EmptyState>
      )}

      {/* The league's homework, public — who has declared what. */}
      <h2 className="mt-8 mb-2 text-sm font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        Declarations
      </h2>
      <ul className="flex flex-col gap-1 text-sm mb-6">
        {data.declared.map((d) => (
          <li
            key={d.teamId}
            className="flex items-center justify-between rounded bg-mns-card border border-[var(--color-border)] px-3 py-2 tabular-nums"
          >
            <span>{d.teamName}</span>
            <b>
              {d.count}/{data.maxKeepers}
            </b>
          </li>
        ))}
      </ul>

      {data.isCommissioner && inPhase ? (
        <div className="rounded-lg border border-[var(--color-border-interactive)] bg-mns-card p-4">
          <b>Lock keepers &amp; open the draft</b>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            Every non-keeper goes back in the pool and the league moves to the draft phase. Teams
            that declared nothing keep nobody.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant={confirmLock ? 'danger' : 'primary'}
              onClick={() => (confirmLock ? lock() : setConfirmLock(true))}
              disabled={busy}
            >
              {confirmLock ? 'Yes — lock and release' : 'Lock keepers'}
            </Button>
            {confirmLock ? (
              <Button variant="quiet" onClick={() => setConfirmLock(false)}>
                Not yet
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
