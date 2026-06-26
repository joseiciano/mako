import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LocalVideoPreview } from './local-video-preview'

class TestMediaStream {
  constructor(public tracks: MediaStreamTrack[]) {}
}

describe('LocalVideoPreview', function () {
  afterEach(function () {
    vi.unstubAllGlobals()
  })

  it('binds the local video track to the video element', function () {
    vi.stubGlobal('MediaStream', TestMediaStream)
    const videoTrack = { id: 'local-track' } as unknown as MediaStreamTrack

    render(
      <LocalVideoPreview
        isVideoEnabled={true}
        isAudioEnabled={true}
        videoTrack={videoTrack}
      />,
    )

    const video = screen.getByLabelText('Local video') as HTMLVideoElement & {
      srcObject: TestMediaStream | null
    }
    expect(video.srcObject).toBeInstanceOf(TestMediaStream)
    expect(video.srcObject?.tracks).toEqual([videoTrack])
  })
})
