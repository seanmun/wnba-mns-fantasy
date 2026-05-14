import { useEffect, useRef } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react'

// Upserts the Clerk user into the local users table on first load after
// sign-in. One-shot via useRef; silent failure (retries on next mount).
export function useUserSync(): void {
  const { user, isLoaded } = useUser()
  const { getToken } = useAuth()
  const hasSynced = useRef(false)

  useEffect(() => {
    if (!isLoaded || !user || hasSynced.current) return

    const sync = async () => {
      try {
        const token = await getToken()
        if (!token) return
        const res = await fetch('/api/users/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: user.primaryEmailAddress?.emailAddress ?? '',
            displayName: user.fullName ?? user.username ?? 'Player',
            avatarUrl: user.imageUrl ?? null,
          }),
        })
        if (res.ok) hasSynced.current = true
      } catch {
        // silent — retry on next mount
      }
    }
    void sync()
  }, [isLoaded, user, getToken])
}
