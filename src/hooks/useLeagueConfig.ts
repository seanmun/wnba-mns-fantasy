import { useQuery } from '@tanstack/react-query'
import { useApi } from './useApi'
import type { League } from '../types/league'

export function useLeagueConfig(leagueId: string | undefined) {
  const { apiFetch } = useApi()

  const query = useQuery({
    queryKey: ['league', leagueId],
    queryFn: () => apiFetch<League>(`/api/leagues/${leagueId}`),
    enabled: !!leagueId,
    staleTime: 5 * 60 * 1000,
  })

  return {
    league: query.data ?? null,
    config: query.data?.config ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  }
}
