export function bindVideoTrack(
  videoElement: HTMLVideoElement | null,
  videoTrack: MediaStreamTrack | null,
) {
  if (!videoElement) return

  videoElement.srcObject =
    videoTrack && typeof MediaStream !== 'undefined'
      ? new MediaStream([videoTrack])
      : null
}
