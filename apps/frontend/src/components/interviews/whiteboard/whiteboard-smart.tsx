import { useEffect, useMemo } from 'react'
import { mapProvisionToWhiteboardConfig } from './whiteboard-config'
import { WhiteboardDumb } from './whiteboard-dumb'
import { WhiteboardRuntime } from './whiteboard-runtime'
import type { WhiteboardSmartProps } from './whiteboard-types'

export function WhiteboardSmart({
  RuntimeComponent = WhiteboardRuntime,
  connectionStatus,
  errorMessage,
  provisionedWhiteboard,
  onConnecting,
  onConnected,
  onReconnecting,
  onFailed,
  onRetryJoin,
}: WhiteboardSmartProps) {
  const collaborationConfig = useMemo(
    function mapConfig() {
      return mapProvisionToWhiteboardConfig(provisionedWhiteboard)
    },
    [
      provisionedWhiteboard?.excalidraw.excalidraw_key,
      provisionedWhiteboard?.excalidraw.excalidraw_room_id,
      provisionedWhiteboard?.mode,
      provisionedWhiteboard?.realtime.realtime_session_id,
      provisionedWhiteboard?.realtime.token,
    ],
  )

  useEffect(
    function enterConnectingStateAfterProvision() {
      if (!collaborationConfig || connectionStatus !== 'idle') return
      onConnecting()
    },
    [collaborationConfig, connectionStatus, onConnecting],
  )

  if (!collaborationConfig) {
    return (
      <WhiteboardDumb
        canvasSlot={<EmptyCanvas />}
        errorMessage="Whiteboard credentials are unavailable. Retry the session connection."
        onRetryJoin={onRetryJoin}
        status="failed"
      />
    )
  }

  return (
    <WhiteboardDumb
      canvasSlot={
        <RuntimeComponent
          config={collaborationConfig}
          onConnected={onConnected}
          onFailed={function handleFailed() {
            onFailed('Whiteboard sync could not recover. Retry the session connection.')
          }}
          onReconnecting={onReconnecting}
        />
      }
      errorMessage={errorMessage}
      onRetryJoin={onRetryJoin}
      status={connectionStatus === 'idle' ? 'connecting' : connectionStatus}
    />
  )
}

function EmptyCanvas() {
  return (
    <div className="flex h-full min-h-[28rem] items-center justify-center p-6 text-sm text-slate-400">
      Whiteboard is not available yet.
    </div>
  )
}
