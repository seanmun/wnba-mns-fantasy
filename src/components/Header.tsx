import { Link } from 'react-router-dom'
import { SignedIn, SignedOut, UserButton } from '@clerk/clerk-react'
import { branding } from '../lib/branding'

export function Header() {
  return (
    <header className="bg-mns-card border-b border-white/5 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-white">
          <img
            src={branding.assets.logo}
            alt={branding.identity.shortName}
            className="w-8 h-8"
          />
          <span className="font-semibold">{branding.identity.shortName}</span>
        </Link>
        <div className="flex items-center gap-3">
          <SignedOut>
            <Link
              to="/sign-in"
              className="text-sm text-green-500 hover:text-green-400"
            >
              Sign in
            </Link>
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </div>
    </header>
  )
}
