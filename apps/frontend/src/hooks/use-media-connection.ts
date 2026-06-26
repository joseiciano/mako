import { useCallback, useEffect, useRef, useState } from 'react'
import { useRealtimeKitClient } from '@cloudflare/realtimekit-react'
import {
  getMediaPermissionError,
  logMeetingError,
} from './media-connection-error-helpers'
import { getFirstRemoteVideoTrack } from './media-track-helpers'
import { useConnectionTimeout } from './use-connection-timeout'
import type {
  MediaConnectionConfig,
  MediaConnectionStatus,
  MediaPermissionError,
  UseMediaConnectionReturn,
} from '#/components/interviews/media'

export function useMediaConnection(
  config: MediaConnectionConfig | null,
): UseMediaConnectionReturn {
  const [meeting, initMeeting] = useRealtimeKitClient()
  const [status, setStatus] = useState<MediaConnectionStatus>('pre-join')
  const [permissionError, setPermissionError] =
    useState<MediaPermissionError | null>(null)
  const [isAudioEnabled, setIsAudioEnabled] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [remoteParticipantCount, setRemoteParticipantCount] = useState(0)
  const [localVideoTrack, setLocalVideoTrack] =
    useState<MediaStreamTrack | null>(null)
  const [remoteVideoTrack, setRemoteVideoTrack] =
    useState<MediaStreamTrack | null>(null)
  const isConnectingRef = useRef(false)
  const statusRef = useRef<MediaConnectionStatus>('pre-join')
  const configRef = useRef(config)
  const leavePromisesRef = useRef<WeakMap<object, Promise<void>>>(new WeakMap())

  const handleConnectionTimeout = useCallback(() => {
    if (statusRef.current === 'connecting') {
      setStatus('failed')
      isConnectingRef.current = false
    }
  }, [])

  const { startConnectionTimeout, clearConnectionTimeout } =
    useConnectionTimeout({ onTimeout: handleConnectionTimeout })

  const leaveMeeting = useCallback((meetingToLeave: unknown) => {
    if (!meetingToLeave || typeof meetingToLeave !== 'object') {
      return Promise.resolve()
    }

    const existingLeave = leavePromisesRef.current.get(meetingToLeave)
    if (existingLeave) return existingLeave

    const leave = (meetingToLeave as { leave?: () => Promise<void> }).leave
    if (!leave) return Promise.resolve()

    const leavePromise = leave.call(meetingToLeave).catch((error) => {
      logMeetingError('Failed to leave meeting:', error)
    })

    leavePromisesRef.current.set(meetingToLeave, leavePromise)
    return leavePromise
  }, [])

  const handleFailedToggle = useCallback(
    async (activeMeeting: unknown, error: unknown) => {
      setPermissionError(getMediaPermissionError(error))
      clearConnectionTimeout()
      isConnectingRef.current = false
      await leaveMeeting(activeMeeting)
      setRemoteParticipantCount(0)
      setIsAudioEnabled(false)
      setIsVideoEnabled(false)
      setLocalVideoTrack(null)
      setRemoteVideoTrack(null)
      setStatus('failed')
    },
    [clearConnectionTimeout, leaveMeeting],
  )

  // Keep config ref in sync for reconnects
  useEffect(() => {
    configRef.current = config
  }, [config])

  // Keep status ref in sync for timeout checks
  useEffect(() => {
    statusRef.current = status
  }, [status])

  // Cleanup meeting on unmount or meeting replacement.
  useEffect(() => {
    return () => {
      void leaveMeeting(meeting)
    }
  }, [meeting, leaveMeeting])

  const connect = useCallback(() => {
    if (isConnectingRef.current || !configRef.current) return

    isConnectingRef.current = true
    setStatus('connecting')
    setPermissionError(null)

    startConnectionTimeout()

    initMeeting({
      authToken: configRef.current.token,
      // @ts-expect-error RealtimeKit SDK types don't include roomName but the API accepts it
      roomName: configRef.current.realtimeSessionId,
      defaults: {
        audio: true,
        video: true,
      },
      onError: (error: { code?: string; message?: string; name?: string }) => {
        // Handle permission errors without logging sensitive tokens
        setPermissionError(getMediaPermissionError(error))
        setStatus('failed')
        isConnectingRef.current = false
        clearConnectionTimeout()
      },
    })
  }, [initMeeting, startConnectionTimeout, clearConnectionTimeout])

  const disconnect = useCallback(async () => {
    const meetingToLeave = meeting
    isConnectingRef.current = false
    clearConnectionTimeout()
    setStatus('pre-join')
    setPermissionError(null)
    setRemoteParticipantCount(0)
    setIsAudioEnabled(false)
    setIsVideoEnabled(false)
    setLocalVideoTrack(null)
    setRemoteVideoTrack(null)
    await leaveMeeting(meetingToLeave)
  }, [meeting, clearConnectionTimeout, leaveMeeting])

  const reconnect = useCallback(async () => {
    if (!meeting) {
      connect()
      return
    }
    await disconnect()
    connect()
  }, [disconnect, connect])

  // Join meeting after init
  useEffect(() => {
    if (!meeting || status !== 'connecting') return

    let cancelled = false

    meeting
      .join()
      .catch((error) => {
        if (cancelled) return
        logMeetingError('Meeting join failed:', error)
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

    const syncRemoteParticipantState = () => {
      setRemoteParticipantCount(meeting.participants.joined.size)
      setRemoteVideoTrack(getFirstRemoteVideoTrack(meeting.participants.joined))
    }

    const handleRoomJoined = () => {
      setIsAudioEnabled(meeting.self.audioEnabled)
      setIsVideoEnabled(meeting.self.videoEnabled)
      setLocalVideoTrack(
        meeting.self.videoEnabled ? meeting.self.videoTrack ?? null : null,
      )
      syncRemoteParticipantState()
      setStatus('connected')
      isConnectingRef.current = false
      clearConnectionTimeout()
    }

    const handleRoomLeft = () => {
      setRemoteParticipantCount(0)
      setIsAudioEnabled(false)
      setIsVideoEnabled(false)
      setLocalVideoTrack(null)
      setRemoteVideoTrack(null)
      if (isConnectingRef.current) return

      setStatus((currentStatus) =>
        currentStatus === 'pre-join' ? 'pre-join' : 'failed',
      )
    }

    const handleParticipantChange = syncRemoteParticipantState

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

    const handleAudioUpdate = ({
      audioEnabled,
    }: {
      audioEnabled: boolean
    }) => {
      setIsAudioEnabled(audioEnabled)
    }

    const handleVideoUpdate = ({
      videoEnabled,
      videoTrack,
    }: {
      videoEnabled: boolean
      videoTrack?: MediaStreamTrack | null
    }) => {
      setIsVideoEnabled(videoEnabled)
      setLocalVideoTrack(
        videoEnabled ? videoTrack ?? meeting.self.videoTrack ?? null : null,
      )
    }

    const handleRemoteVideoUpdate = () => {
      syncRemoteParticipantState()
    }

    meeting.self.on('roomJoined', handleRoomJoined)
    meeting.self.on('roomLeft', handleRoomLeft)
    meeting.participants.joined.on('participantJoined', handleParticipantChange)
    meeting.participants.joined.on('participantLeft', handleParticipantChange)
    meeting.meta.on('mediaConnectionUpdate', handleMediaConnectionUpdate)
    meeting.self.on('audioUpdate', handleAudioUpdate)
    meeting.self.on('videoUpdate', handleVideoUpdate)
    meeting.participants.joined.on('videoUpdate', handleRemoteVideoUpdate)

    return () => {
      meeting.self.off('roomJoined', handleRoomJoined)
      meeting.self.off('roomLeft', handleRoomLeft)
      meeting.participants.joined.off(
        'participantJoined',
        handleParticipantChange,
      )
      meeting.participants.joined.off(
        'participantLeft',
        handleParticipantChange,
      )
      meeting.meta.off('mediaConnectionUpdate', handleMediaConnectionUpdate)
      meeting.self.off('audioUpdate', handleAudioUpdate)
      meeting.self.off('videoUpdate', handleVideoUpdate)
      meeting.participants.joined.off('videoUpdate', handleRemoteVideoUpdate)
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
      meeting.self
        .disableAudio()
        .catch((error) => logMeetingError('Failed to disable audio:', error))
    } else {
      meeting.self.enableAudio().catch((error) => {
        logMeetingError('Failed to enable audio:', error)
        void handleFailedToggle(meeting, error)
      })
    }
  }, [meeting, handleFailedToggle])

  const toggleVideo = useCallback(() => {
    if (!meeting || !meeting.self.roomJoined) return

    if (meeting.self.videoEnabled) {
      meeting.self
        .disableVideo()
        .catch((error) => logMeetingError('Failed to disable video:', error))
    } else {
      meeting.self.enableVideo().catch((error) => {
        logMeetingError('Failed to enable video:', error)
        void handleFailedToggle(meeting, error)
      })
    }
  }, [meeting, handleFailedToggle])

  return {
    status,
    permissionError,
    isAudioEnabled,
    isVideoEnabled,
    remoteParticipantCount,
    localVideoTrack,
    remoteVideoTrack,
    connect,
    disconnect,
    reconnect,
    toggleAudio,
    toggleVideo,
  }
}
