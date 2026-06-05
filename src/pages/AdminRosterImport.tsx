import { useState } from 'react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'
import { useUser } from '@clerk/clerk-react'
import { toast } from 'sonner'
import { useApi } from '../hooks/useApi'
import { useLeague } from '../contexts/LeagueContext'

const TEMPLATE_CSV = `name,team,slot,position,keeperPriorYearRound,isRookie
A'ja Wilson,TWJ,active,F,3,false
Sabrina Ionescu,NYL,active,G,5,false
Lauren Betts,WAS,redshirt,F,,true`

interface ParsedRow {
  rowIndex: number
  playerName: string
  teamAbbrev?: string | null
  slot?: 'active' | 'bench' | 'ir' | 'redshirt' | 'international'
  position?: string
  keeperPriorYearRound?: number | null
  isRookie?: boolean
}

interface ImportResult {
  rowIndex: number
  playerName: string
  status: 'updated' | 'no_player_match' | 'no_team_match' | 'error'
  message?: string
}

export function AdminRosterImport() {
  const { user } = useUser()
  const { currentLeague, loading: leagueLoading } = useLeague()
  const { apiFetch } = useApi()

  const [csv, setCsv] = useState('')
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)

  const isCommissioner =
    !!user && !!currentLeague && currentLeague.commissionerId === user.id

  if (leagueLoading) return <Centered>Loading…</Centered>

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

  if (!isCommissioner) {
    return (
      <Centered>
        <p className="mb-4">Only the commissioner can import rosters.</p>
        <Link to={`/league/${currentLeague.id}`} className="text-green-400 hover:text-green-300">
          ← Back to league
        </Link>
      </Centered>
    )
  }

  const handleParse = () => {
    setResults(null)
    setParseError(null)

    const result = Papa.parse<Record<string, string>>(csv.trim(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    })

    if (result.errors.length > 0) {
      setParseError(result.errors.map((e) => `Row ${e.row ?? '?'}: ${e.message}`).join('; '))
      return
    }

    const rows: ParsedRow[] = []
    for (let i = 0; i < result.data.length; i++) {
      const r = result.data[i]
      const name = (r.name || r.player || r.playerName || '').trim()
      if (!name) continue
      const row: ParsedRow = {
        rowIndex: i,
        playerName: name,
      }
      const team = (r.team || r.teamAbbrev || r.abbrev || '').trim()
      if (team) row.teamAbbrev = team.toUpperCase()
      const slot = (r.slot || '').trim().toLowerCase()
      if (['active', 'bench', 'ir', 'redshirt', 'international'].includes(slot)) {
        row.slot = slot as ParsedRow['slot']
      }
      const position = (r.position || r.pos || '').trim()
      if (position) row.position = position.toUpperCase()
      const roundRaw = (r.keeperPriorYearRound || r.priorRound || r.round || '').trim()
      if (roundRaw) {
        const n = Number(roundRaw)
        if (Number.isFinite(n)) row.keeperPriorYearRound = n
      }
      const rookieRaw = (r.isRookie || r.rookie || '').trim().toLowerCase()
      if (rookieRaw === 'true' || rookieRaw === '1' || rookieRaw === 'yes') {
        row.isRookie = true
      } else if (rookieRaw === 'false' || rookieRaw === '0' || rookieRaw === 'no') {
        row.isRookie = false
      }
      rows.push(row)
    }

    if (rows.length === 0) {
      setParseError('No usable rows found. CSV must have a "name" column.')
      return
    }

    setParsed(rows)
  }

  const handleSubmit = async () => {
    if (!parsed || parsed.length === 0) return
    setSubmitting(true)
    setResults(null)
    try {
      const res = await apiFetch<{
        totalRows: number
        updated: number
        results: ImportResult[]
      }>(`/api/leagues/${currentLeague.id}/imports/roster`, {
        method: 'POST',
        body: JSON.stringify({
          rows: parsed.map((r) => ({
            playerName: r.playerName,
            teamAbbrev: r.teamAbbrev,
            slot: r.slot,
            position: r.position,
            keeperPriorYearRound: r.keeperPriorYearRound,
            isRookie: r.isRookie,
          })),
        }),
      })
      setResults(res.results)
      toast.success(`Roster import: ${res.updated} updated out of ${res.totalRows}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setSubmitting(false)
    }
  }

  const matchedCount = results?.filter((r) => r.status === 'updated').length ?? 0
  const unmatchedCount = results
    ? results.filter((r) => r.status !== 'updated').length
    : 0

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Roster Import</h1>
          <p className="text-gray-400 mt-1">
            Bulk-assign players to teams + set keeper rounds from CSV. {currentLeague.name}.
          </p>
        </div>
        <Link
          to={`/league/${currentLeague.id}`}
          className="text-sm text-gray-400 hover:text-white"
        >
          ← Back to league
        </Link>
      </div>

      <div className="bg-mns-card border border-gray-800 rounded-lg p-5 mb-6">
        <h2 className="text-lg font-bold mb-2">CSV Format</h2>
        <p className="text-sm text-gray-400 mb-3">
          Header row required. Recognized columns: <code className="text-gray-300">name</code>,{' '}
          <code className="text-gray-300">team</code>,{' '}
          <code className="text-gray-300">slot</code>,{' '}
          <code className="text-gray-300">position</code>,{' '}
          <code className="text-gray-300">keeperPriorYearRound</code>,{' '}
          <code className="text-gray-300">isRookie</code>. Only{' '}
          <code className="text-gray-300">name</code> is required.
        </p>
        <p className="text-sm text-gray-400 mb-2">
          Set <code className="text-gray-300">team</code> to a team's abbreviation to assign,
          blank/missing to leave as free agent. <code className="text-gray-300">keeperPriorYearRound</code>{' '}
          captures last year's keeper round (1-13) — leave blank to set later.
        </p>
        <button
          type="button"
          onClick={() => setCsv(TEMPLATE_CSV)}
          className="text-sm text-green-400 hover:text-green-300"
        >
          Use example template →
        </button>
      </div>

      <div className="bg-mns-card border border-gray-800 rounded-lg p-5 mb-4">
        <label className="block text-sm font-semibold text-gray-300 mb-2">
          Paste CSV
        </label>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="name,team,slot,..."
          rows={12}
          className="w-full px-3 py-2 bg-mns-dark border border-gray-700 rounded text-white font-mono text-sm placeholder-gray-500 focus:border-green-400 focus:outline-none"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleParse}
            disabled={!csv.trim()}
            className="px-5 py-2 bg-mns-hover hover:bg-mns-card border border-gray-700 text-white font-semibold rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Parse
          </button>
          {parsed && (
            <div className="text-sm text-gray-400">
              {parsed.length} row{parsed.length === 1 ? '' : 's'} parsed
            </div>
          )}
          {parseError && (
            <div className="text-sm text-red-400">{parseError}</div>
          )}
        </div>
      </div>

      {parsed && parsed.length > 0 && !results && (
        <div className="bg-mns-card border border-gray-800 rounded-lg overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead className="bg-mns-hover text-gray-400 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Team</th>
                <th className="px-3 py-2 text-left">Slot</th>
                <th className="px-3 py-2 text-left">Pos</th>
                <th className="px-3 py-2 text-left">Prior Round</th>
                <th className="px-3 py-2 text-left">Rookie</th>
              </tr>
            </thead>
            <tbody>
              {parsed.map((r) => (
                <tr key={r.rowIndex} className="border-t border-gray-800">
                  <td className="px-3 py-1.5 text-gray-500">{r.rowIndex + 1}</td>
                  <td className="px-3 py-1.5 text-white">{r.playerName}</td>
                  <td className="px-3 py-1.5 text-gray-300">{r.teamAbbrev ?? '—'}</td>
                  <td className="px-3 py-1.5 text-gray-300">{r.slot ?? '—'}</td>
                  <td className="px-3 py-1.5 text-gray-300">{r.position ?? '—'}</td>
                  <td className="px-3 py-1.5 text-gray-300">{r.keeperPriorYearRound ?? '—'}</td>
                  <td className="px-3 py-1.5 text-gray-300">{r.isRookie === undefined ? '—' : r.isRookie ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {parsed && parsed.length > 0 && !results && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="px-6 py-3 bg-green-500 hover:bg-green-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold rounded-lg transition-colors"
        >
          {submitting ? 'Importing…' : `Import ${parsed.length} row${parsed.length === 1 ? '' : 's'}`}
        </button>
      )}

      {results && (
        <div className="bg-mns-card border border-gray-800 rounded-lg p-5 mb-4">
          <h2 className="text-lg font-bold mb-3">Result</h2>
          <p className="text-gray-300 mb-4">
            <span className="text-green-400 font-bold">{matchedCount}</span> updated
            {unmatchedCount > 0 && (
              <>
                {' · '}
                <span className="text-red-400 font-bold">{unmatchedCount}</span> failed
              </>
            )}
          </p>
          {unmatchedCount > 0 && (
            <div className="text-sm">
              <div className="font-semibold text-gray-300 mb-1">Failures:</div>
              <ul className="space-y-1 text-gray-400">
                {results
                  .filter((r) => r.status !== 'updated')
                  .map((r) => (
                    <li key={r.rowIndex}>
                      <span className="text-white">{r.playerName}</span> ·{' '}
                      <span className="text-red-400">{r.status}</span>
                      {r.message ? ` — ${r.message}` : ''}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setResults(null)
                setParsed(null)
                setCsv('')
              }}
              className="px-4 py-2 bg-mns-hover hover:bg-mns-card border border-gray-700 text-white font-semibold rounded transition-colors"
            >
              Import another
            </button>
            <Link
              to="/lm/rosters"
              className="px-4 py-2 bg-green-500 hover:bg-green-400 text-black font-bold rounded transition-colors"
            >
              Open Roster Manager →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center text-gray-300">
      {children}
    </div>
  )
}
