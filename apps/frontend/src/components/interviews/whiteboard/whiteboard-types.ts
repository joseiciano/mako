import type { ComponentType, ReactNode } from 'react'
import type { ProvisionInterviewResponse } from '@mako/shared'
import type { WhiteboardSceneApi } from './whiteboard-scene-store'
import type { WhiteboardProvisionHandle } from './whiteboard-shared-types'

export type ProvisionedWhiteboardConfig = ProvisionInterviewResponse
export type { WhiteboardProvisionHandle } from './whiteboard-shared-types'

export type WhiteboardConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

export type WhiteboardCollaborationConfig = {
  mode: ProvisionInterviewResponse['mode']
  realtimeSessionId: string
  realtimeToken: string
  roomId: string
  roomKey: string
  collaborationEnabled: true
}

export type WhiteboardRuntimeProps = {
  collaborationEnabled: boolean
  onConnected: () => void
  onReconnecting: () => void
  onFailed: (message: string) => void
  onSceneApiReady: (api: WhiteboardSceneApi) => void
}

export type WhiteboardRuntimeComponent = ComponentType<WhiteboardRuntimeProps>

export type WhiteboardDumbProps = {
  status: WhiteboardConnectionStatus
  errorMessage: string | null
  onRetryJoin: () => void
  canvasSlot: ReactNode
}

export type WhiteboardSmartProps = {
  connectionStatus: WhiteboardConnectionStatus
  errorMessage: string | null
  provisionedWhiteboardHandle: WhiteboardProvisionHandle | null
  onConnecting: () => void
  onConnected: () => void
  onReconnecting: () => void
  onFailed: (message: string) => void
  onRetryJoin: () => void
  RuntimeComponent?: WhiteboardRuntimeComponent
}
