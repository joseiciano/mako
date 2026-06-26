import { useEffect, useRef } from 'react'
import { Users } from 'lucide-react'
import type { MediaConnectionStatus } from './media-types'
import { bindVideoTrack } from './video-track-binding'

export type RemoteParticipantIndicatorProps = {
  status: MediaConnectionStatus
  remoteParticipantCount: number
  videoTrack: MediaStreamTrack | null
}

export function RemoteParticipantIndicator({
  status,
  remoteParticipantCount,
  videoTrack,
}: RemoteParticipantIndicatorProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canShowRemoteVideo =
    status === 'connected' && remoteParticipantCount > 0 && videoTrack

  useEffect(() => {
    bindVideoTrack(videoRef.current, canShowRemoteVideo ? videoTrack : null)

    return () => bindVideoTrack(videoRef.current, null)
  }, [canShowRemoteVideo, videoTrack])

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
      {canShowRemoteVideo ? (
        <video
          ref={videoRef}
          aria-label="Peer video"
          autoPlay
          playsInline
          disablePictureInPicture
          className="h-full w-full object-cover"
        />
      ) : status === 'connected' && remoteParticipantCount > 0 ? (
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
