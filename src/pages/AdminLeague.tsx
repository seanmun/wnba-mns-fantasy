import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { toast } from 'sonner'
import { useApi } from '../hooks/useApi'
import { useLeague } from '../contexts/LeagueContext'
import type { League } from '../types/league'
import type { LeagueConfig } from '../types/leagueConfig'

export function AdminLeague() {
  const { user } = useUser()
  const { currentLeague, loading, refreshLeagues } = useLeague()
  const { apiFetch } = useApi()

  const [name, setName] = useState('')
  const [config, setConfig] = useState<LeagueConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (currentLeague) {
      setName(currentLeague.name)
      setConfig(currentLeague.config)
    }
  }, [currentLeague])

  if (loading) return <Centered>Loading…</Centered>

  if (!currentLeague) {
    return (
      <Centered>
        <p className="mb-4">No league selected.</p>
        <Link to="/teams" className="text-green-400 hover:text-green-300">
          ← Pick a league
        </Link>
      </Centered>
    )
  }

  const isCommissioner =
    !!user && currentLeague.commissionerId === user.id

  if (!isCommissioner) {
    return (
      <Centered>
        <p className="mb-4">Only the commissioner can change league settings.</p>
        <Link
          to={`/league/${currentLeague.id}`}
          className="text-green-400 hover:text-green-300"
        >
          ← Back to league
        </Link>
      </Centered>
    )
  }

  if (!config) return <Centered>Loading config…</Centered>

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiFetch<League>(`/api/leagues/${currentLeague.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), config }),
      })
      refreshLeagues()
      toast.success('League settings saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">League Settings</h1>
          <p className="text-gray-400 mt-1">
            {currentLeague.name} · {currentLeague.sport.toUpperCase()} ·{' '}
            {currentLeague.seasonYear}
          </p>
        </div>
        <Link
          to={`/league/${currentLeague.id}`}
          className="text-sm text-gray-400 hover:text-white"
        >
          ← Back to league
        </Link>
      </div>

      <p className="text-sm text-gray-400 mb-6">
        Override anything from the WNBA preset. Everything else stays at the
        default. Changes apply immediately on save — they don't affect already-
        locked rosters/keepers/fees.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <Section title="Identity">
          <Row label="League Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className={inputClass}
            />
          </Row>
        </Section>

        <Section title="Season + Schedule">
          <NumRow
            label="Start Date (YYYY-MM-DD)"
            value={config.season.startDate}
            onChange={(v) =>
              setConfig({ ...config, season: { ...config.season, startDate: String(v) } })
            }
            asText
          />
          <NumRow
            label="Regular-Season Weeks"
            value={config.season.weeks}
            onChange={(v) =>
              setConfig({ ...config, season: { ...config.season, weeks: Number(v) } })
            }
          />
          <NumRow
            label="Trade Deadline (week #)"
            value={config.schedule.tradeDeadlineWeek}
            onChange={(v) =>
              setConfig({
                ...config,
                schedule: { ...config.schedule, tradeDeadlineWeek: Number(v) },
              })
            }
          />
          <NumRow
            label="Playoff Teams"
            value={config.schedule.playoffTeams}
            onChange={(v) =>
              setConfig({
                ...config,
                schedule: { ...config.schedule, playoffTeams: Number(v) },
              })
            }
          />
          <NumRow
            label="Playoff Weeks"
            value={config.schedule.playoffWeeks}
            onChange={(v) =>
              setConfig({
                ...config,
                schedule: { ...config.schedule, playoffWeeks: Number(v) },
              })
            }
          />
          <NumRow
            label="First-Round Byes"
            value={config.schedule.playoffByeTeams}
            onChange={(v) =>
              setConfig({
                ...config,
                schedule: { ...config.schedule, playoffByeTeams: Number(v) },
              })
            }
          />
        </Section>

        <Section title="Roster">
          <NumRow
            label="Active Roster Size"
            value={config.roster.activeSize}
            onChange={(v) =>
              setConfig({ ...config, roster: { ...config.roster, activeSize: Number(v) } })
            }
          />
          <NumRow
            label="Starters per Matchup"
            value={config.roster.starterSize}
            onChange={(v) =>
              setConfig({ ...config, roster: { ...config.roster, starterSize: Number(v) } })
            }
          />
          <NumRow
            label="IR Slots"
            value={config.roster.irSlots}
            onChange={(v) =>
              setConfig({ ...config, roster: { ...config.roster, irSlots: Number(v) } })
            }
          />
          <NumRow
            label="Max Keepers"
            value={config.roster.maxKeepers}
            onChange={(v) =>
              setConfig({ ...config, roster: { ...config.roster, maxKeepers: Number(v) } })
            }
          />
        </Section>

        <Section title="Draft">
          <NumRow
            label="Draft Rounds"
            value={config.draft.rounds}
            onChange={(v) =>
              setConfig({ ...config, draft: { ...config.draft, rounds: Number(v) } })
            }
          />
          <NumRow
            label="Rookie Draft Rounds"
            value={config.draft.rookieRounds}
            onChange={(v) =>
              setConfig({ ...config, draft: { ...config.draft, rookieRounds: Number(v) } })
            }
          />
        </Section>

        <Section title="Salary Cap (dollars)">
          <NumRow
            label="Base Cap"
            value={config.cap.base}
            onChange={(v) =>
              setConfig({ ...config, cap: { ...config.cap, base: Number(v) } })
            }
          />
          <NumRow
            label="Hard Cap"
            value={config.cap.hardCap}
            onChange={(v) =>
              setConfig({ ...config, cap: { ...config.cap, hardCap: Number(v) } })
            }
          />
          <NumRow
            label="Trade Cap Flex (± dollars)"
            value={config.cap.tradeDelta}
            onChange={(v) =>
              setConfig({ ...config, cap: { ...config.cap, tradeDelta: Number(v) } })
            }
          />
          <NumRow
            label="First Apron (0 = disabled)"
            value={config.cap.firstApron}
            onChange={(v) =>
              setConfig({ ...config, cap: { ...config.cap, firstApron: Number(v) } })
            }
          />
          <NumRow
            label="Second Apron (0 = disabled)"
            value={config.cap.secondApron}
            onChange={(v) =>
              setConfig({ ...config, cap: { ...config.cap, secondApron: Number(v) } })
            }
          />
          <NumRow
            label="Penalty per $1M over second apron"
            value={config.cap.penaltyRatePerM}
            onChange={(v) =>
              setConfig({
                ...config,
                cap: { ...config.cap, penaltyRatePerM: Number(v) },
              })
            }
          />
        </Section>

        <Section title="Fees (dollars)">
          <NumRow
            label="Buy-In"
            value={config.fees.buyIn}
            onChange={(v) =>
              setConfig({ ...config, fees: { ...config.fees, buyIn: Number(v) } })
            }
          />
          <NumRow
            label="First Apron Fee"
            value={config.fees.firstApronFee}
            onChange={(v) =>
              setConfig({
                ...config,
                fees: { ...config.fees, firstApronFee: Number(v) },
              })
            }
          />
          <NumRow
            label="Franchise Tag Fee"
            value={config.fees.franchiseTagFee}
            onChange={(v) =>
              setConfig({
                ...config,
                fees: { ...config.fees, franchiseTagFee: Number(v) },
              })
            }
          />
          <NumRow
            label="Redshirt Fee"
            value={config.fees.redshirtFee}
            onChange={(v) =>
              setConfig({
                ...config,
                fees: { ...config.fees, redshirtFee: Number(v) },
              })
            }
          />
          <NumRow
            label="Mid-Season Activation Fee"
            value={config.fees.activationFee}
            onChange={(v) =>
              setConfig({
                ...config,
                fees: { ...config.fees, activationFee: Number(v) },
              })
            }
          />
        </Section>

        <Section title="Scoring">
          <Row label="Mode">
            <select
              value={config.scoring.mode}
              onChange={(e) =>
                setConfig({
                  ...config,
                  scoring: {
                    ...config.scoring,
                    mode: e.target.value as 'matchup_record' | 'category_record',
                  },
                })
              }
              className={inputClass}
            >
              <option value="category_record">Category record (9-cat W/L/T)</option>
              <option value="matchup_record">Matchup record (single W/L)</option>
            </select>
          </Row>
          <Row label="Categories">
            <div className="text-gray-400 text-sm py-2">
              {config.scoring.categories.join(' · ')}
            </div>
          </Row>
        </Section>

        <Section title="Keeper Rules">
          <Row label="Advance Rule">
            <select
              value={config.keeper.advanceRule}
              onChange={(e) =>
                setConfig({
                  ...config,
                  keeper: {
                    ...config.keeper,
                    advanceRule: e.target.value as 'minus_one' | 'flat' | 'custom',
                  },
                })
              }
              className={inputClass}
            >
              <option value="minus_one">Minus one (keeper costs one round earlier)</option>
              <option value="flat">Flat (same round year over year)</option>
              <option value="custom">Custom (handled externally)</option>
            </select>
          </Row>
          <Row label="Fallback Round">
            <input
              type="number"
              value={config.keeper.fallbackRound ?? ''}
              placeholder="leave blank to require explicit per-player"
              onChange={(e) =>
                setConfig({
                  ...config,
                  keeper: {
                    ...config.keeper,
                    fallbackRound:
                      e.target.value === '' ? null : Number(e.target.value),
                  },
                })
              }
              className={inputClass}
            />
          </Row>
          <Row label="Franchise Tag Allowed">
            <Toggle
              value={config.keeper.franchiseTagAllowed}
              onChange={(v) =>
                setConfig({
                  ...config,
                  keeper: { ...config.keeper, franchiseTagAllowed: v },
                })
              }
            />
          </Row>
        </Section>
      </div>

      <div className="mt-8 flex items-center gap-3 sticky bottom-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-green-500 hover:bg-green-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        <Link
          to={`/league/${currentLeague.id}`}
          className="px-6 py-3 bg-mns-card hover:bg-mns-hover border border-gray-700 text-white font-semibold rounded-lg transition-colors"
        >
          Cancel
        </Link>
      </div>
    </div>
  )
}

const inputClass =
  'w-full px-3 py-2 bg-mns-dark border border-gray-700 rounded text-white placeholder-gray-500 focus:border-green-400 focus:outline-none'

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-300">
      {children}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-mns-card border border-gray-800 rounded-lg p-5">
      <h2 className="text-lg font-bold mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 items-center">
      <label className="text-sm text-gray-300 sm:col-span-1">{label}</label>
      <div className="sm:col-span-2">{children}</div>
    </div>
  )
}

function NumRow({
  label,
  value,
  onChange,
  asText,
}: {
  label: string
  value: number | string
  onChange: (v: number | string) => void
  asText?: boolean
}) {
  return (
    <Row label={label}>
      <input
        type={asText ? 'text' : 'number'}
        value={value}
        onChange={(e) =>
          onChange(asText ? e.target.value : Number(e.target.value))
        }
        className={inputClass}
      />
    </Row>
  )
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`px-3 py-1.5 text-sm font-semibold rounded transition-colors ${
        value
          ? 'bg-green-500 text-black hover:bg-green-400'
          : 'bg-mns-dark border border-gray-700 text-gray-400 hover:text-white'
      }`}
    >
      {value ? 'On' : 'Off'}
    </button>
  )
}
