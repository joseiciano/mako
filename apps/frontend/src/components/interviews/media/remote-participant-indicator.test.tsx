import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RemoteParticipantIndicator } from './remote-participant-indicator'

class TestMediaStream {
  constructor(public tracks: MediaStreamTrack[]) {}
}

describe('RemoteParticipantIndicator', function () {
  afterEach(function () {
    vi.unstubAllGlobals()
  })

  it('binds the remote video track to the video element', function () {
    vi.stubGlobal('MediaStream', TestMediaStream)
    const videoTrack = { id: 'remote-track' } as unknown as MediaStreamTrack

    render(
      <RemoteParticipantIndicator
        status="connected"
        remoteParticipantCount={1}
        videoTrack={videoTrack}
      />,
    )

    const video = screen.getByLabelText('Peer video') as HTMLVideoElement & {
      srcObject: TestMediaStream | null
    }
    expect(video.srcObject).toBeInstanceOf(TestMediaStream)
    expect(video.srcObject?.tracks).toEqual([videoTrack])
  })
})
