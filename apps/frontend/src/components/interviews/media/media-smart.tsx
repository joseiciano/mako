import { useEffect } from 'react'
import { useMediaConnection } from '#/hooks/use-media-connection'
import { MediaDumb } from './media-dumb'
import type { MediaConnectionConfig } from './media-types'

export type MediaSmartProps = {
  config: MediaConnectionConfig | null
  onConnecting: () => void
  onConnected: () => void
  onWaitingForPeer: () => void
  onReconnecting: () => void
  onFailed: (message: string) => void
  onPermissionError: (error: 'denied' | 'system-denied' | 'device-unavailable') => void
}

export function MediaSmart({
  config,
  onConnecting,
  onConnected,
  onWaitingForPeer,
  onReconnecting,
  onFailed,
  onPermissionError,
}: MediaSmartProps) {
  const media = useMediaConnection(config)

  // Notify parent of state changes
  useEffect(() => {
    switch (media.status) {
      case 'connecting':
        onConnecting()
        break
      case 'connected':
        onConnected()
        break
      case 'waiting-for-peer':
        onWaitingForPeer()
        break
      case 'reconnecting':
        onReconnecting()
        break
      case 'failed':
        onFailed('Media connection failed')
        break
    }
  }, [
    media.status,
    onConnecting,
    onConnected,
    onWaitingForPeer,
    onReconnecting,
    onFailed,
  ])

  // Notify parent of permission errors
  useEffect(() => {
    if (media.permissionError) {
      onPermissionError(media.permissionError)
    }
  }, [media.permissionError, onPermissionError])

  // Auto-connect when config is provided and we're in pre-join state
  useEffect(() => {
    if (config && media.status === 'pre-join') {
      media.connect()
    }
  }, [config, media.status, media.connect])

  return (
    <MediaDumb
      status={media.status}
      permissionError={media.permissionError}
      isAudioEnabled={media.isAudioEnabled}
      isVideoEnabled={media.isVideoEnabled}
      remoteParticipantCount={media.remoteParticipantCount}
      onToggleAudio={media.toggleAudio}
      onToggleVideo={media.toggleVideo}
      onReconnect={media.reconnect}
    />
  )
}
