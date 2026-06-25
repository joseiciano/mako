import { useEffect, useRef } from 'react'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  RefreshCw,
  AlertCircle,
  Users,
} from 'lucide-react'
import type { MediaConnectionStatus, MediaPermissionError } from './media-types'

export type MediaDumbProps = {
  status: MediaConnectionStatus
  permissionError: MediaPermissionError | null
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  remoteParticipantCount: number
  onToggleAudio: () => void
  onToggleVideo: () => void
  onReconnect: () => void
}

export function MediaDumb(props: MediaDumbProps) {
  return (
    <div className="flex flex-col gap-4">
      {renderConnectionState(props)}
      {renderVideoArea(props)}
      {renderControls(props)}
    </div>
  )
}

function renderConnectionState(props: MediaDumbProps) {
  const { status, permissionError } = props

  if (status === 'connecting') {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-blue-800 bg-blue-950/40 px-4 py-3 text-blue-200"
        role="status"
      >
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
        <p className="text-sm">Connecting to media session...</p>
      </div>
    )
  }

  if (status === 'waiting-for-peer') {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-3 text-amber-200"
        role="status"
      >
        <Users className="h-4 w-4" />
        <p className="text-sm">Waiting for the other participant to join...</p>
      </div>
    )
  }

  if (status === 'reconnecting') {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-3 text-amber-200"
        role="status"
      >
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
        <p className="text-sm">Reconnecting to media session...</p>
      </div>
    )
  }

  if (status === 'failed' || permissionError) {
    return (
      <div
        className="flex flex-col gap-2 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-red-200"
        role="alert"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <p className="text-sm font-medium">
            {getErrorMessage(permissionError)}
          </p>
        </div>
        {permissionError && (
          <p className="text-xs text-red-300">
            {getErrorGuidance(permissionError)}
          </p>
        )}
        <button
          className="mt-1 inline-flex items-center gap-1 self-start rounded-md border border-red-400 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20"
          onClick={props.onReconnect}
          type="button"
        >
          <RefreshCw className="h-3 w-3" />
          Retry Connection
        </button>
      </div>
    )
  }

  return null
}

function getErrorMessage(error: MediaPermissionError | null): string {
  switch (error) {
    case 'denied':
      return 'Camera or microphone access was denied'
    case 'system-denied':
      return 'Camera or microphone access was blocked by your system'
    case 'device-unavailable':
      return 'Camera or microphone is not available'
    default:
      return 'Media connection failed'
  }
}

function getErrorGuidance(error: MediaPermissionError | null): string {
  switch (error) {
    case 'denied':
      return 'Please allow camera and microphone access in your browser settings, then try again.'
    case 'system-denied':
      return 'Check your system preferences to allow camera and microphone access for this browser.'
    case 'device-unavailable':
      return 'Make sure your camera and microphone are connected and not being used by another application.'
    default:
      return 'Please check your internet connection and try again.'
  }
}

function renderVideoArea(props: MediaDumbProps) {
  const { status } = props

  if (status === 'pre-join' || status === 'failed') {
    return null
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <LocalVideoPreview
        isVideoEnabled={props.isVideoEnabled}
        isAudioEnabled={props.isAudioEnabled}
      />
      <RemoteParticipantIndicator
        status={props.status}
        remoteParticipantCount={props.remoteParticipantCount}
      />
    </div>
  )
}

function LocalVideoPreview({
  isVideoEnabled,
  isAudioEnabled,
}: {
  isVideoEnabled: boolean
  isAudioEnabled: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    // In a real implementation, this would bind to the local video track
    // from the RealtimeKit meeting.self.videoTrack
    // For now, we render a placeholder that shows the media state
  }, [])

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
      {isVideoEnabled ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          disablePictureInPicture
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <VideoOff className="h-8 w-8" />
            <span className="text-xs">Camera off</span>
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs text-white">
        {isAudioEnabled ? (
          <Mic className="h-3 w-3" />
        ) : (
          <MicOff className="h-3 w-3 text-red-400" />
        )}
        <span>You</span>
      </div>
    </div>
  )
}

function RemoteParticipantIndicator({
  status,
  remoteParticipantCount,
}: {
  status: MediaConnectionStatus
  remoteParticipantCount: number
}) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
      {status === 'connected' && remoteParticipantCount > 0 ? (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Users className="h-8 w-8" />
            <span className="text-xs">Participant connected</span>
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <Users className="h-8 w-8" />
            <span className="text-xs">Waiting for peer...</span>
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
        Peer
      </div>
    </div>
  )
}

function renderControls(props: MediaDumbProps) {
  const { status, isAudioEnabled, isVideoEnabled } = props

  if (status === 'pre-join' || status === 'failed') {
    return null
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <button
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
          isAudioEnabled
            ? 'bg-slate-700 text-white hover:bg-slate-600'
            : 'bg-red-600 text-white hover:bg-red-500'
        }`}
        onClick={props.onToggleAudio}
        type="button"
        aria-label={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
      >
        {isAudioEnabled ? (
          <Mic className="h-4 w-4" />
        ) : (
          <MicOff className="h-4 w-4" />
        )}
        {isAudioEnabled ? 'Mute' : 'Unmute'}
      </button>

      <button
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
          isVideoEnabled
            ? 'bg-slate-700 text-white hover:bg-slate-600'
            : 'bg-red-600 text-white hover:bg-red-500'
        }`}
        onClick={props.onToggleVideo}
        type="button"
        aria-label={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
      >
        {isVideoEnabled ? (
          <Video className="h-4 w-4" />
        ) : (
          <VideoOff className="h-4 w-4" />
        )}
        {isVideoEnabled ? 'Stop Video' : 'Start Video'}
      </button>
    </div>
  )
}