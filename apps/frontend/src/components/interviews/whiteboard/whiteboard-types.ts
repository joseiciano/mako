import type { ComponentType, ReactNode } from 'react'
import type { ProvisionInterviewResponse } from '@mako/shared'

export type ProvisionedWhiteboardConfig = ProvisionInterviewResponse

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
  config: WhiteboardCollaborationConfig
  onConnected: () => void
  onReconnecting: () => void
  onFailed: (message: string) => void
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
  provisionedWhiteboard: ProvisionedWhiteboardConfig | null
  onConnecting: () => void
  onConnected: () => void
  onReconnecting: () => void
  onFailed: (message: string) => void
  onRetryJoin: () => void
  RuntimeComponent?: WhiteboardRuntimeComponent
}
