import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { useApi } from '../hooks/useApi'
import { useLeague } from '../contexts/LeagueContext'
import type { League } from '../types/league'

export function CreateLeague() {
  const navigate = useNavigate()
  const { user } = useUser()
  const { apiFetch } = useApi()
  const { refreshLeagues } = useLeague()

  const defaultName =
    user?.firstName ? `${user.firstName}'s WNBA Dynasty` : 'My WNBA Dynasty'
  const [name, setName] = useState(defaultName)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const league = await apiFetch<League>('/api/leagues', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      })
      refreshLeagues()
      navigate(`/league/${league.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create league')
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-4xl font-bold mb-2">Create a WNBA Dynasty</h1>
      <p className="text-gray-400 mb-8">
        Spin up a new MNS WNBA league. You become the commissioner. We'll set
        you up in the keeper phase with the standard WNBA preset — every
        knob is editable from the LM Hub once the league is live.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            League Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Money Never Sleeps WNBA"
            className="w-full px-4 py-3 bg-mns-card border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-green-400 focus:outline-none transition-colors"
            maxLength={100}
            required
            autoFocus
          />
          <p className="mt-2 text-xs text-gray-500">
            Up to 100 characters. You can rename later from league settings.
          </p>
        </div>

        <div className="bg-mns-card border border-gray-800 rounded-lg p-5 text-sm text-gray-400">
          <div className="font-semibold text-gray-300 mb-2">Defaults applied</div>
          <ul className="space-y-1">
            <li>• Sport: WNBA · Season 2026</li>
            <li>• 10 active roster spots, 5 keepers max, 3 IR slots</li>
            <li>• 10-round snake draft, 2 rookie rounds</li>
            <li>• $1.5M cap, $50 buy-in, $15 franchise tag, $10 redshirt</li>
            <li>• 13-week regular season, 6-team playoffs (3 weeks, top 2 byes)</li>
            <li>• 9-cat category-record scoring</li>
          </ul>
          <p className="mt-3 text-xs text-gray-500">
            All editable from <span className="text-gray-300">/lm/league</span> after creation.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-900/30 border border-red-500/30 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="px-6 py-3 bg-green-500 hover:bg-green-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors"
          >
            {submitting ? 'Creating...' : 'Create League'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/teams')}
            className="px-6 py-3 bg-mns-card hover:bg-mns-hover border border-gray-700 text-white font-semibold rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
