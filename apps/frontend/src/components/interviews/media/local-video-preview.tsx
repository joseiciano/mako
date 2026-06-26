import { useEffect, useRef } from 'react'
import { Mic, MicOff, VideoOff } from 'lucide-react'
import { bindVideoTrack } from './video-track-binding'

export type LocalVideoPreviewProps = {
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  videoTrack: MediaStreamTrack | null
}

export function LocalVideoPreview({
  isVideoEnabled,
  isAudioEnabled,
  videoTrack,
}: LocalVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    bindVideoTrack(videoRef.current, isVideoEnabled ? videoTrack : null)

    return () => bindVideoTrack(videoRef.current, null)
  }, [isVideoEnabled, videoTrack])

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
      {isVideoEnabled ? (
        <video
          ref={videoRef}
          aria-label="Local video"
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
