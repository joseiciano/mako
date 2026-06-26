import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  RefreshCw,
  AlertCircle,
  Users,
} from 'lucide-react'
import { getErrorGuidance, getErrorMessage } from './media-error-helpers'
import { LocalVideoPreview } from './local-video-preview'
import { RemoteParticipantIndicator } from './remote-participant-indicator'
import type { MediaConnectionStatus, MediaPermissionError } from './media-types'

export type MediaDumbProps = {
  status: MediaConnectionStatus
  permissionError: MediaPermissionError | null
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  remoteParticipantCount: number
  localVideoTrack: MediaStreamTrack | null
  remoteVideoTrack: MediaStreamTrack | null
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
        videoTrack={props.localVideoTrack}
      />
      <RemoteParticipantIndicator
        status={props.status}
        remoteParticipantCount={props.remoteParticipantCount}
        videoTrack={props.remoteVideoTrack}
      />
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
