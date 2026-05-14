import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'

// Legacy magic-link landing from mns/. With Clerk, session hydration
// happens automatically; this page just redirects to the right place
// once Clerk has loaded.
export function FinishSignIn() {
  const navigate = useNavigate()
  const { isLoaded, isSignedIn } = useAuth()

  useEffect(() => {
    if (!isLoaded) return
    navigate(isSignedIn ? '/teams' : '/sign-in', { replace: true })
  }, [isLoaded, isSignedIn, navigate])

  return (
    <div className="min-h-screen bg-mns-dark flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-500 border-r-transparent" />
        <div className="mt-4 text-gray-400">Finishing sign-in...</div>
      </div>
    </div>
  )
}
