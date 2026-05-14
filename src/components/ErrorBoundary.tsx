import { Component, type ReactNode } from 'react'
import * as Sentry from '@sentry/react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack ?? '' },
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-screen items-center justify-center bg-mns-dark text-gray-300">
            <div className="text-center p-6">
              <div className="text-xl mb-2">Something went wrong.</div>
              <button
                onClick={() => window.location.reload()}
                className="text-green-500 underline hover:text-green-400"
              >
                Reload
              </button>
            </div>
          </div>
        )
      )
    }
    return this.props.children
  }
}
