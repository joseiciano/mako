export type MediaConnectionStatus =
  | 'pre-join'
  | 'connecting'
  | 'connected'
  | 'waiting-for-peer'
  | 'reconnecting'
  | 'failed'

export type MediaPermissionError =
  | 'denied'
  | 'system-denied'
  | 'device-unavailable'

export type MediaConnectionState = {
  status: MediaConnectionStatus
  permissionError: MediaPermissionError | null
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  remoteParticipantCount: number
}

export type MediaConnectionActions = {
  connect: () => void
  disconnect: () => void
  reconnect: () => void
  toggleAudio: () => void
  toggleVideo: () => void
}

export type UseMediaConnectionReturn = MediaConnectionState &
  MediaConnectionActions

export type MediaConnectionConfig = {
  realtimeSessionId: string
  token: string
}