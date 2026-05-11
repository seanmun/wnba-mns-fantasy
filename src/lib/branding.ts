import type { Sport } from '../types/leagueConfig'

// Sport-specific branding. Everything UI-facing that would change if
// we forked this app for NBA lives here — components read from this
// object, not from string literals scattered through the codebase.
export const branding = {
  identity: {
    appName: 'MNS WNBA',
    shortName: 'MNS WNBA',
    longName: 'Money Never Sleeps WNBA',
    tagline: 'Dynasty fantasy WNBA — every dollar counts',
    sport: 'wnba' as Sport,
    seasonLabel: '2026 WNBA',
  },

  assets: {
    logo: '/icons/mnsBall-icon.webp',
    favicon: '/icons/mnsBall-icon.webp',
    ogImage: '/icons/moneyneversleeps-icon.webp',
    appleTouchIcon: '/icons/mnsBall-icon.webp',
    heroVideoDesktop: '/video/left-ball.mp4',
    heroVideoMobile: '/video/center-ball.mp4',
    hinkieFolder: '/hinkie',
    prizePoolFolder: '/prizePool',
  },

  colors: {
    accent: '#22c55e',
    accentLight: '#4ade80',
    accentDark: '#16a34a',
    background: '#0a0a0a',
    card: '#121212',
    hover: '#1a1a1a',
    danger: '#ef4444',
    warning: '#f59e0b',
  },

  footer: {
    copyright: '© 2026 Money Never Sleeps',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Roadmap', href: '/roadmap' },
      { label: 'Changelog', href: '/changelog' },
      { label: 'Media', href: '/media' },
      { label: 'Privacy', href: '/privacy' },
    ],
  },

  platform: {
    parentUrl: 'https://mnsfantasy.com',
    appUrl: 'https://wnba.mnsfantasy.com',
    supportEmail: 'noreply@e.moneyneversleeps.app',
  },
} as const

export type Branding = typeof branding
