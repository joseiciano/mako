import { useCallback, useEffect, useMemo } from 'react'
import { mapProvisionToWhiteboardConfig } from './whiteboard-config'
import { WhiteboardDumb } from './whiteboard-dumb'
import { WhiteboardRuntime } from './whiteboard-runtime'
import { getWhiteboardProvisionConfig } from './whiteboard-provision-store'
import {
  registerWhiteboardSceneApi,
  unregisterWhiteboardSceneApi,
} from './whiteboard-scene-store'
import type { WhiteboardSceneApi } from './whiteboard-scene-store'
import type { WhiteboardSmartProps } from './whiteboard-types'

export function WhiteboardSmart({
  RuntimeComponent = WhiteboardRuntime,
  connectionStatus,
  errorMessage,
  provisionedWhiteboardHandle,
  onConnecting,
  onConnected,
  onReconnecting,
  onFailed,
  onRetryJoin,
}: WhiteboardSmartProps) {
  const hasCollaborationConfig = useMemo(
    function validateConfig() {
      const provisionedWhiteboard = getWhiteboardProvisionConfig(provisionedWhiteboardHandle)
      return mapProvisionToWhiteboardConfig(provisionedWhiteboard) !== null
    },
    [provisionedWhiteboardHandle],
  )

  useEffect(
    function enterConnectingStateAfterProvision() {
      if (!hasCollaborationConfig || connectionStatus !== 'idle') return
      onConnecting()
    },
    [hasCollaborationConfig, connectionStatus, onConnecting],
  )

  useEffect(
    function sceneApiLifecycle() {
      if (!hasCollaborationConfig) return
      return function cleanup() {
        unregisterWhiteboardSceneApi(provisionedWhiteboardHandle)
      }
    },
    [hasCollaborationConfig, provisionedWhiteboardHandle],
  )

  const handleSceneApiReady = useCallback(
    function handleSceneApiReady(api: WhiteboardSceneApi) {
      registerWhiteboardSceneApi(provisionedWhiteboardHandle, api)
    },
    [provisionedWhiteboardHandle],
  )

  const handleFailed = useCallback(
    function handleFailed() {
      onFailed('Whiteboard sync could not recover. Retry the session connection.')
    },
    [onFailed],
  )
  const canvasSlot = useMemo(
    function createCanvasSlot() {
      return (
        <RuntimeComponent
          collaborationEnabled={true}
          onConnected={onConnected}
          onFailed={handleFailed}
          onReconnecting={onReconnecting}
          onSceneApiReady={handleSceneApiReady}
        />
      )
    },
    [RuntimeComponent, onConnected, onReconnecting, handleFailed, handleSceneApiReady],
  )

  if (!hasCollaborationConfig) {
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
      errorMessage={errorMessage}
      canvasSlot={canvasSlot}
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
