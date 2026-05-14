import { Link } from 'react-router-dom'
import { branding } from '../lib/branding'

export function Footer() {
  return (
    <footer className="bg-mns-card border-t border-white/5 px-4 py-6 text-sm text-gray-400">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>{branding.footer.copyright}</div>
        <nav className="flex flex-wrap gap-4 justify-center">
          {branding.footer.links.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
