import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useApi } from '../hooks/useApi'
import type { League } from '../types/league'

interface LeagueContextType {
  currentLeagueId: string | null
  currentLeague: League | null
  userLeagues: League[]
  loading: boolean
  setCurrentLeagueId: (leagueId: string) => void
  refreshLeagues: () => void
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined)

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const { apiFetch } = useApi()
  const [userLeagues, setUserLeagues] = useState<League[]>([])
  const [currentLeagueId, setCurrentLeagueIdState] = useState<string | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [fetchVersion, setFetchVersion] = useState(0)

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setUserLeagues([])
      setCurrentLeagueIdState(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const fetchLeagues = async () => {
      try {
        setLoading(true)
        const leagues = await apiFetch<League[]>('/api/leagues')
        if (cancelled) return
        setUserLeagues(leagues)
        if (!currentLeagueId && leagues.length > 0) {
          const saved = localStorage.getItem('currentLeagueId')
          const fallback =
            leagues.find((l) => l.id === saved) ?? leagues[0]
          setCurrentLeagueIdState(fallback.id)
          localStorage.setItem('currentLeagueId', fallback.id)
        }
      } catch {
        if (!cancelled) setUserLeagues([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchLeagues()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, fetchVersion])

  const setCurrentLeagueId = useCallback((leagueId: string) => {
    setCurrentLeagueIdState(leagueId)
    localStorage.setItem('currentLeagueId', leagueId)
  }, [])

  const refreshLeagues = useCallback(() => {
    setFetchVersion((v) => v + 1)
  }, [])

  const currentLeague = useMemo(
    () => userLeagues.find((l) => l.id === currentLeagueId) ?? null,
    [userLeagues, currentLeagueId]
  )

  const value = useMemo(
    () => ({
      currentLeagueId,
      currentLeague,
      userLeagues,
      loading,
      setCurrentLeagueId,
      refreshLeagues,
    }),
    [
      currentLeagueId,
      currentLeague,
      userLeagues,
      loading,
      setCurrentLeagueId,
      refreshLeagues,
    ]
  )

  return (
    <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>
  )
}

export function useLeague() {
  const ctx = useContext(LeagueContext)
  if (!ctx) throw new Error('useLeague must be used within LeagueProvider')
  return ctx
}
