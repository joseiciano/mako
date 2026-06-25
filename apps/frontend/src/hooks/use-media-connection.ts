import { useCallback, useEffect, useRef, useState } from 'react'
import { useRealtimeKitClient } from '@cloudflare/realtimekit-react'
import type {
  MediaConnectionConfig,
  MediaConnectionStatus,
  MediaPermissionError,
  UseMediaConnectionReturn,
} from '#/components/interviews/media/media-types'

const CONNECTION_TIMEOUT_MS = 30000

export function useMediaConnection(
  config: MediaConnectionConfig | null,
): UseMediaConnectionReturn {
  const [meeting, initMeeting] = useRealtimeKitClient()
  const [status, setStatus] = useState<MediaConnectionStatus>('pre-join')
  const [permissionError, setPermissionError] =
    useState<MediaPermissionError | null>(null)
  const [remoteParticipantCount, setRemoteParticipantCount] = useState(0)
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const isConnectingRef = useRef(false)
  const configRef = useRef(config)

  // Keep config ref in sync for reconnects
  useEffect(() => {
    configRef.current = config
  }, [config])

  // Cleanup on unmount: leave meeting and clear timeout
  useEffect(() => {
    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current)
      }
      if (meeting) {
        meeting.leave()
      }
    }
  }, [meeting])

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
      connectionTimeoutRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (isConnectingRef.current || !configRef.current) return

    isConnectingRef.current = true
    setStatus('connecting')
    setPermissionError(null)

    // Set connection timeout
    connectionTimeoutRef.current = setTimeout(() => {
      if (status === 'connecting') {
        setStatus('failed')
        isConnectingRef.current = false
      }
    }, CONNECTION_TIMEOUT_MS)

    initMeeting({
      authToken: configRef.current.token,
      // @ts-expect-error RealtimeKit SDK types don't include roomName but the API accepts it
      roomName: configRef.current.realtimeSessionId,
      defaults: {
        audio: true,
        video: true,
      },
      onError: (error: { code?: string; message?: string }) => {
        // Handle permission errors without logging sensitive tokens
        if (error.code === '1602' || error.code === '2101') {
          setPermissionError('denied')
          setStatus('failed')
        } else if (error.code === '1603') {
          setPermissionError('device-unavailable')
          setStatus('failed')
        } else if (error.code === '0014') {
          setStatus('failed')
        }
        isConnectingRef.current = false
        clearConnectionTimeout()
      },
    })
  }, [initMeeting, status, clearConnectionTimeout])

  const disconnect = useCallback(() => {
    if (meeting) {
      meeting.leave()
    }
    isConnectingRef.current = false
    clearConnectionTimeout()
    setStatus('pre-join')
    setPermissionError(null)
    setRemoteParticipantCount(0)
  }, [meeting, clearConnectionTimeout])

  const reconnect = useCallback(() => {
    disconnect()
    // Small delay to ensure cleanup before reconnect
    setTimeout(() => {
      connect()
    }, 100)
  }, [disconnect, connect])

  // Join meeting after init
  useEffect(() => {
    if (!meeting || status !== 'connecting') return

    let cancelled = false

    meeting
      .join()
      .then(() => {
        if (cancelled) return
        clearConnectionTimeout()
        setStatus('connected')
        isConnectingRef.current = false
      })
      .catch(() => {
        if (cancelled) return
        clearConnectionTimeout()
        setStatus('failed')
        isConnectingRef.current = false
      })

    return () => {
      cancelled = true
    }
  }, [meeting, status, clearConnectionTimeout])

  // Listen for room join and participant changes
  useEffect(() => {
    if (!meeting) return

    const handleRoomJoined = () => {
      setStatus('connected')
      isConnectingRef.current = false
      clearConnectionTimeout()
    }

    const handleRoomLeft = () => {
      setStatus('pre-join')
      setRemoteParticipantCount(0)
    }

    const handleParticipantJoined = () => {
      setRemoteParticipantCount(meeting.participants.joined.size)
    }

    const handleParticipantLeft = () => {
      setRemoteParticipantCount(meeting.participants.joined.size)
    }

    const handleMediaConnectionUpdate = ({
      state,
    }: {
      state: string
    }) => {
      if (state === 'reconnecting') {
        setStatus('reconnecting')
      } else if (state === 'connected') {
        setStatus('connected')
      } else if (state === 'failed') {
        setStatus('failed')
        isConnectingRef.current = false
      }
    }

    meeting.self.on('roomJoined', handleRoomJoined)
    meeting.self.on('roomLeft', handleRoomLeft)
    meeting.participants.joined.on('participantJoined', handleParticipantJoined)
    meeting.participants.joined.on('participantLeft', handleParticipantLeft)
    meeting.meta.on('mediaConnectionUpdate', handleMediaConnectionUpdate)

    return () => {
      meeting.self.off('roomJoined', handleRoomJoined)
      meeting.self.off('roomLeft', handleRoomLeft)
      meeting.participants.joined.off(
        'participantJoined',
        handleParticipantJoined,
      )
      meeting.participants.joined.off(
        'participantLeft',
        handleParticipantLeft,
      )
      meeting.meta.off('mediaConnectionUpdate', handleMediaConnectionUpdate)
    }
  }, [meeting, clearConnectionTimeout])

  // Update waiting-for-peer state based on participant count
  useEffect(() => {
    if (status === 'connected' && remoteParticipantCount === 0) {
      setStatus('waiting-for-peer')
    } else if (
      status === 'waiting-for-peer' &&
      remoteParticipantCount > 0
    ) {
      setStatus('connected')
    }
  }, [status, remoteParticipantCount])

  const toggleAudio = useCallback(() => {
    if (!meeting || !meeting.self.roomJoined) return

    if (meeting.self.audioEnabled) {
      meeting.self.disableAudio()
    } else {
      meeting.self.enableAudio().catch(() => {
        setPermissionError('denied')
      })
    }
  }, [meeting])

  const toggleVideo = useCallback(() => {
    if (!meeting || !meeting.self.roomJoined) return

    if (meeting.self.videoEnabled) {
      meeting.self.disableVideo()
    } else {
      meeting.self.enableVideo().catch(() => {
        setPermissionError('denied')
      })
    }
  }, [meeting])

  return {
    status,
    permissionError,
    isAudioEnabled: meeting?.self.audioEnabled ?? false,
    isVideoEnabled: meeting?.self.videoEnabled ?? false,
    remoteParticipantCount,
    connect,
    disconnect,
    reconnect,
    toggleAudio,
    toggleVideo,
  }
}