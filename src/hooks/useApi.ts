import { useAuth } from '@clerk/clerk-react'
import { useCallback } from 'react'

export function useApi() {
  const { getToken } = useAuth()

  const apiFetch = useCallback(
    async <T = unknown>(path: string, options?: RequestInit): Promise<T> => {
      const token = await getToken()
      const res = await fetch(path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options?.headers,
        },
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string
          message?: string
        }
        throw new Error(body.error ?? body.message ?? `API error: ${res.status}`)
      }
      return res.json() as Promise<T>
    },
    [getToken]
  )

  return { apiFetch }
}
