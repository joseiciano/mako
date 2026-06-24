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
    // Sanitize long error messages that may contain library internals
    this.props.onFailed(message.length < 100 ? message : 'Excalidraw failed to load')
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

function ConnectedOnMount({
  onConnected,
  isCollaborating,
}: {
  onConnected: () => void
  isCollaborating: boolean
}) {
  useEffect(function signalConnected() {
    onConnected()
  }, [onConnected])

  return <LazyExcalidraw isCollaborating={isCollaborating} />
}

export function WhiteboardRuntime({
  collaborationEnabled,
  onConnected,
  onReconnecting,
  onFailed,
}: WhiteboardRuntimeProps) {
  useEffect(
    function bindNetworkRecoveryEvents() {
      if (typeof window === 'undefined') return

      let isActive = true

      // NOTE: These handlers track browser-level network connectivity,
      // not Excalidraw's WebSocket/realtime connection state.
      function handleBrowserOffline() {
        if (isActive) onReconnecting()
      }

      function handleBrowserOnline() {
        if (isActive) onConnected()
      }

      window.addEventListener('offline', handleBrowserOffline)
      window.addEventListener('online', handleBrowserOnline)

      return function cleanup() {
        isActive = false
        window.removeEventListener('offline', handleBrowserOffline)
        window.removeEventListener('online', handleBrowserOnline)
      }
    },
    [onConnected, onReconnecting],
  )

  return (
    <div className="h-[28rem] min-h-[28rem] w-full" data-testid="whiteboard-runtime">
      <ExcalidrawErrorBoundary onFailed={onFailed}>
        <Suspense fallback={<RuntimeFallback />}>
          <ConnectedOnMount onConnected={onConnected} isCollaborating={collaborationEnabled} />
        </Suspense>
      </ExcalidrawErrorBoundary>
    </div>
  )
}
