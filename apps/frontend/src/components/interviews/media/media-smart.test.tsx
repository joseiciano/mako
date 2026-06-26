import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MediaSmart, type MediaSmartProps } from './media-smart'
import { useMediaConnection } from '#/hooks/use-media-connection'
import type { MediaConnectionStatus, UseMediaConnectionReturn } from './media-types'

vi.mock('#/hooks/use-media-connection', function () {
  return {
    useMediaConnection: vi.fn(),
  }
})

vi.mock('./media-dumb', function () {
  return {
    MediaDumb: vi.fn(function MockMediaDumb() {
      return <div data-testid="media-dumb" />
    }),
  }
})

function makeMedia(overrides?: Partial<UseMediaConnectionReturn>): UseMediaConnectionReturn {
  return {
    status: 'pre-join',
    permissionError: null,
    isAudioEnabled: false,
    isVideoEnabled: false,
    remoteParticipantCount: 0,
    localVideoTrack: null,
    remoteVideoTrack: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    toggleAudio: vi.fn(),
    toggleVideo: vi.fn(),
    ...overrides,
  }
}

function makeProps(overrides?: Partial<MediaSmartProps>): MediaSmartProps {
  return {
    config: { realtimeSessionId: 'rt-1', token: 'token-1' },
    onConnecting: vi.fn(),
    onConnected: vi.fn(),
    onWaitingForPeer: vi.fn(),
    onReconnecting: vi.fn(),
    onFailed: vi.fn(),
    onPermissionError: vi.fn(),
    ...overrides,
  }
}

describe('MediaSmart', function () {
  beforeEach(function () {
    vi.clearAllMocks()
  })

  it('auto-connects when config is provided and media is pre-join', async function () {
    const connect = vi.fn()
    vi.mocked(useMediaConnection).mockReturnValue(makeMedia({ connect }))

    render(<MediaSmart {...makeProps()} />)

    await waitFor(function () {
      expect(connect).toHaveBeenCalledOnce()
    })
  })

  it('does not auto-connect without config', function () {
    const connect = vi.fn()
    vi.mocked(useMediaConnection).mockReturnValue(makeMedia({ connect }))

    render(<MediaSmart {...makeProps({ config: null })} />)

    expect(connect).not.toHaveBeenCalled()
  })

  it.each([
    ['connecting', 'onConnecting', undefined],
    ['connected', 'onConnected', undefined],
    ['waiting-for-peer', 'onWaitingForPeer', undefined],
    ['reconnecting', 'onReconnecting', undefined],
    ['failed', 'onFailed', 'Media connection failed'],
  ] as const)(
    'dispatches %s status callback',
    async function (status: MediaConnectionStatus, callbackName: keyof MediaSmartProps, expectedArgument) {
      const callback = vi.fn()
      vi.mocked(useMediaConnection).mockReturnValue(makeMedia({ status }))

      render(<MediaSmart {...makeProps({ [callbackName]: callback })} />)

      await waitFor(function () {
        if (expectedArgument) {
          expect(callback).toHaveBeenCalledWith(expectedArgument)
        } else {
          expect(callback).toHaveBeenCalledOnce()
        }
      })
    },
  )

  it('forwards permission errors', async function () {
    const onPermissionError = vi.fn()
    vi.mocked(useMediaConnection).mockReturnValue(
      makeMedia({ status: 'failed', permissionError: 'denied' }),
    )

    render(<MediaSmart {...makeProps({ onPermissionError })} />)

    await waitFor(function () {
      expect(onPermissionError).toHaveBeenCalledWith('denied')
    })
  })

  it('does not dispatch generic failure when permission error is present', async function () {
    const onFailed = vi.fn()
    const onPermissionError = vi.fn()
    vi.mocked(useMediaConnection).mockReturnValue(
      makeMedia({ status: 'failed', permissionError: 'denied' }),
    )

    render(<MediaSmart {...makeProps({ onFailed, onPermissionError })} />)

    await waitFor(function () {
      expect(onPermissionError).toHaveBeenCalledWith('denied')
    })
    expect(onFailed).not.toHaveBeenCalled()
  })
})
