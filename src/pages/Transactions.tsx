import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { Chip, EmptyState, PageHeader, Skeleton } from '../ui/components'

interface Txn {
  id: string
  type: 'add_drop' | 'waiver' | 'trade'
  teamNames: string[]
  detail: {
    added?: string
    dropped?: string
    assets?: Array<{ name: string; toTeamName: string | null; fromTeamName: string | null }>
  }
  at: string
}

const TYPE_LABEL: Record<Txn['type'], string> = {
  add_drop: 'Pickup',
  waiver: 'Waiver',
  trade: 'Trade',
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }) + ' ET'

// Every roster move the league has made, with a clock on it — the page
// that ends "wait, when did you get her?" arguments.
export function Transactions() {
  const { leagueId = '' } = useParams()
  const { apiFetch } = useApi()
  const [rows, setRows] = useState<Txn[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch<Txn[]>(`/api/leagues/${leagueId}/transactions`)
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [apiFetch, leagueId])

  if (error) return <EmptyState title="Something went wrong">{error}</EmptyState>
  if (!rows) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-2">
        <Skeleton h="2.2rem" w="55%" />
        <Skeleton h="3.4rem" />
        <Skeleton h="3.4rem" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-2 pb-24">
      <PageHeader
        back={`/league/${leagueId}`}
        backLabel="League home"
        title="Transactions"
        status="Every move, timestamped — pickups, waivers, trades."
      />
      {rows.length === 0 ? (
        <EmptyState title="No moves yet">
          Pickups, waiver claims and trades will show here the moment they happen.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((t) => {
            // A trade reads by RECEIVER: each side, everything it got.
            const byReceiver = new Map<string, string[]>()
            for (const a of t.detail.assets ?? []) {
              const k = a.toTeamName ?? '?'
              byReceiver.set(k, [...(byReceiver.get(k) ?? []), a.name])
            }
            return (
              <li
                key={t.id}
                className="rounded-lg border border-[var(--color-border)] bg-mns-card px-4 py-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-bold">
                    {t.teamNames.join(' ↔ ')}
                    <span className="ml-1.5">
                      <Chip tone={t.type === 'trade' ? 'key' : 'accent'}>{TYPE_LABEL[t.type]}</Chip>
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.78rem] text-[var(--color-muted-foreground)] tabular-nums">
                    {when(t.at)}
                  </span>
                </div>
                {t.type === 'trade' ? (
                  <div className="mt-1.5 flex flex-col gap-1 text-sm">
                    {[...byReceiver.entries()].map(([team, names]) => (
                      <div key={team}>
                        <b>{team}</b> receives{' '}
                        <span className="text-[var(--color-accent)]">{names.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1.5 flex flex-col gap-0.5 text-sm">
                    {t.detail.added ? (
                      <span>
                        <b className="text-[var(--color-accent)]">＋</b> Added{' '}
                        <b>{t.detail.added}</b>
                        {t.type === 'waiver' ? (
                          <span className="text-[var(--color-muted-foreground)]"> off waivers</span>
                        ) : null}
                      </span>
                    ) : null}
                    {t.detail.dropped ? (
                      <span>
                        <b className="text-[var(--color-pick-loss,#ff453a)]">－</b> Dropped{' '}
                        <b>{t.detail.dropped}</b>
                      </span>
                    ) : null}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
