import { Component, Suspense, lazy, useEffect } from 'react'
import type { ComponentType, ReactNode } from 'react'
import type { WhiteboardRuntimeProps } from './whiteboard-types'

type ExcalidrawComponentProps = {
  isCollaborating?: boolean
}

const LazyExcalidraw = lazy(async function loadExcalidraw() {
  const [module] = await Promise.all([
    import('@excalidraw/excalidraw'),
    import('@excalidraw/excalidraw/index.css'),
  ])

  return {
    default: module.Excalidraw as ComponentType<ExcalidrawComponentProps>,
  }
})

class ExcalidrawErrorBoundary extends Component<
  { children: ReactNode; onFailed: (message: string) => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onFailed: (message: string) => void }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    const message = error instanceof Error ? error.message : 'Excalidraw failed to load'
    this.props.onFailed(message)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center p-6 text-sm text-slate-400">
          Whiteboard failed to load. Retry the session connection.
        </div>
      )
    }
    return this.props.children
  }
}

function RuntimeFallback() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-slate-400">
      Loading Excalidraw canvas…
    </div>
  )
}

export function WhiteboardRuntime({
  config,
  onConnected,
  onReconnecting,
  onFailed,
}: WhiteboardRuntimeProps) {
  useEffect(
    function bindNetworkRecoveryEvents() {
      if (typeof window === 'undefined') return

      let isActive = true

      // Defer connected signal to next microtask so Suspense / lazy
      // resolution can surface a loading failure first.
      const connectedTimer = setTimeout(function emitConnected() {
        if (isActive) onConnected()
      }, 0)

      function handleOffline() {
        if (isActive) onReconnecting()
      }

      function handleOnline() {
        if (isActive) onConnected()
      }

      window.addEventListener('offline', handleOffline)
      window.addEventListener('online', handleOnline)

      return function cleanup() {
        isActive = false
        clearTimeout(connectedTimer)
        window.removeEventListener('offline', handleOffline)
        window.removeEventListener('online', handleOnline)
      }
    },
    [onConnected, onReconnecting],
  )

  return (
    <div className="h-[28rem] min-h-[28rem] w-full" data-testid="whiteboard-runtime">
      <ExcalidrawErrorBoundary onFailed={onFailed}>
        <Suspense fallback={<RuntimeFallback />}>
          <LazyExcalidraw isCollaborating={config.collaborationEnabled} />
        </Suspense>
      </ExcalidrawErrorBoundary>
    </div>
  )
}
