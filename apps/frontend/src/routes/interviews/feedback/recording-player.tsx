import { useState } from 'react'
import type { RecordingStatus } from '@mako/shared'
import { deriveRecordingPlaybackState } from './feedback-report-helpers'

export type RecordingPlayerProps = {
  recordingStatus: RecordingStatus
  recordingUrl: string | null
}

export function RecordingPlayer(props: RecordingPlayerProps) {
  const [hasPlaybackFailed, setHasPlaybackFailed] = useState(false)
  const playbackState = deriveRecordingPlaybackState(props.recordingStatus, props.recordingUrl)

  if (playbackState === 'unavailable') {
    return <p className="text-sm text-slate-400">No recording is available for this session.</p>
  }

  if (playbackState === 'processing') {
    return (
      <p aria-live="polite" className="text-sm text-slate-300" role="status">
        The recording is still processing. Check back soon.
      </p>
    )
  }

  if (playbackState === 'failed') {
    return (
      <p className="text-sm text-amber-200" role="alert">
        We couldn&apos;t process the recording for this session.
      </p>
    )
  }

  if (playbackState === 'expired') {
    return (
      <p className="text-sm text-slate-400">
        The recording is no longer available. Raw recordings are retained for 30 days after the
        interview.
      </p>
    )
  }

  if (hasPlaybackFailed) {
    return (
      <p className="text-sm text-amber-200" role="alert">
        Recording playback failed. Try reloading the page.
      </p>
    )
  }

  return (
    <video
      aria-label="Interview session recording"
      className="w-full rounded-lg border border-slate-800 bg-black"
      controls
      crossOrigin="use-credentials"
      onError={function handlePlaybackError() {
        setHasPlaybackFailed(true)
      }}
      preload="metadata"
      src={props.recordingUrl ?? undefined}
    />
  )
}
