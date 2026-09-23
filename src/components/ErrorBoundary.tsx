import { Component, type ReactNode } from 'react'
import * as Sentry from '@sentry/react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  /**
   * Changing this clears a caught error. Pass the route — without it a
   * single page's crash leaves the boundary stuck, so every OTHER tab
   * shows "Something went wrong" too until a full reload.
   */
  resetKey?: string
}

interface State {
  hasError: boolean
  resetKey?: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) {
      return { hasError: false, resetKey: props.resetKey }
    }
    return null
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
              <div className="text-xl mb-2">Something went wrong on this page.</div>
              <div className="text-sm mb-3 text-gray-500">
                The rest of the league still works — try another tab.
              </div>
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
