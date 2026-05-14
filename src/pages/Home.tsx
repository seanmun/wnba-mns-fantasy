import { useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { useLeague } from '../contexts/LeagueContext'
import { branding } from '../lib/branding'

export function Home() {
  const navigate = useNavigate()
  const { isLoaded, isSignedIn } = useAuth()
  const { userLeagues, loading: leaguesLoading } = useLeague()

  useEffect(() => {
    if (!isLoaded || leaguesLoading) return
    if (!isSignedIn) return
    if (userLeagues.length === 0) {
      navigate('/teams')
    } else if (userLeagues.length === 1) {
      navigate(`/league/${userLeagues[0].id}`)
    } else {
      navigate('/teams')
    }
  }, [isLoaded, isSignedIn, userLeagues, leaguesLoading, navigate])

  // Center-ball video has a blank frame at ~19.5s; loop before it hits.
  const handleCenterBallLoop = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = e.currentTarget
      if (video.currentTime >= 19.5) {
        video.currentTime = 0
      }
    },
    []
  )

  if (!isLoaded || (isSignedIn && leaguesLoading)) {
    return (
      <div className="min-h-screen bg-mns-dark flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-green-500 border-r-transparent" />
          <div className="mt-4 text-gray-400">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-mns-dark text-white">
      <div className="relative overflow-hidden">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-15 hidden md:block"
        >
          <source src={branding.assets.heroVideoDesktop} type="video/mp4" />
        </video>
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-15 md:hidden"
          onTimeUpdate={handleCenterBallLoop}
        >
          <source src={branding.assets.heroVideoMobile} type="video/mp4" />
        </video>

        <div className="absolute inset-0 bg-gradient-to-br from-green-400/10 via-purple-400/10 to-pink-400/10" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center">
            <h1 className="text-4xl sm:text-6xl font-bold mb-4">
              {branding.identity.appName}
            </h1>
            <p className="text-xl sm:text-2xl text-gray-300 mb-8 max-w-2xl mx-auto">
              {branding.identity.tagline}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/sign-in"
                className="inline-block bg-green-500 hover:bg-green-400 text-black font-semibold px-8 py-3 rounded-lg transition-colors"
              >
                Sign in
              </Link>
              <Link
                to="/sign-up"
                className="inline-block bg-mns-card hover:bg-mns-hover border border-white/10 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
              >
                Create account
              </Link>
            </div>
            <p className="mt-6 text-sm text-gray-400">
              {branding.identity.seasonLabel} • Salary cap • Dynasty keepers • Real prize pool
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
