import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MediaDumb, type MediaDumbProps } from './media-dumb'

function makeProps(overrides?: Partial<MediaDumbProps>): MediaDumbProps {
  return {
    status: 'pre-join',
    permissionError: null,
    isAudioEnabled: false,
    isVideoEnabled: false,
    remoteParticipantCount: 0,
    localVideoTrack: null,
    remoteVideoTrack: null,
    onToggleAudio: vi.fn(),
    onToggleVideo: vi.fn(),
    onReconnect: vi.fn(),
    ...overrides,
  }
}

describe('MediaDumb', function () {
  it('renders nothing in pre-join state', function () {
    render(<MediaDumb {...makeProps({ status: 'pre-join' })} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows connecting state', function () {
    render(<MediaDumb {...makeProps({ status: 'connecting' })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/connecting to media session/i)
  })

  it('shows waiting-for-peer state', function () {
    render(<MediaDumb {...makeProps({ status: 'waiting-for-peer' })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/waiting for the other participant/i)
  })

  it('shows reconnecting state', function () {
    render(<MediaDumb {...makeProps({ status: 'reconnecting' })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/reconnecting to media session/i)
  })

  it('shows failed state with retry button', async function () {
    const user = userEvent.setup()
    const onReconnect = vi.fn()
    render(
      <MediaDumb
        {...makeProps({
          status: 'failed',
          onReconnect,
        })}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/media connection failed/i)
    const retryButton = screen.getByRole('button', { name: /retry connection/i })
    await user.click(retryButton)
    expect(onReconnect).toHaveBeenCalledOnce()
  })

  it('shows permission denied error with guidance', function () {
    render(
      <MediaDumb
        {...makeProps({
          status: 'failed',
          permissionError: 'denied',
        })}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/camera or microphone access was denied/i)
    expect(screen.getByText(/please allow camera and microphone access/i)).toBeInTheDocument()
  })

  it('shows device-unavailable error with guidance', function () {
    render(
      <MediaDumb
        {...makeProps({
          status: 'failed',
          permissionError: 'device-unavailable',
        })}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/camera or microphone is not available/i)
    expect(screen.getByText(/make sure your camera and microphone are connected/i)).toBeInTheDocument()
  })

  it('renders video area when connected', function () {
    render(
      <MediaDumb
        {...makeProps({
          status: 'connected',
          isVideoEnabled: true,
          isAudioEnabled: true,
        })}
      />,
    )

    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Peer')).toBeInTheDocument()
  })

  it('shows camera off placeholder when video disabled', function () {
    render(
      <MediaDumb
        {...makeProps({
          status: 'connected',
          isVideoEnabled: false,
          isAudioEnabled: true,
        })}
      />,
    )

    expect(screen.getByText('Camera off')).toBeInTheDocument()
  })

  it('shows waiting for peer in remote area when no participants', function () {
    render(
      <MediaDumb
        {...makeProps({
          status: 'connected',
          remoteParticipantCount: 0,
        })}
      />,
    )

    expect(screen.getByText('Waiting for peer...')).toBeInTheDocument()
  })

  it('shows participant connected when remote participants present', function () {
    render(
      <MediaDumb
        {...makeProps({
          status: 'connected',
          remoteParticipantCount: 1,
        })}
      />,
    )

    expect(screen.getByText('Participant connected')).toBeInTheDocument()
  })

  it('renders media controls when connected', function () {
    render(
      <MediaDumb
        {...makeProps({
          status: 'connected',
          isAudioEnabled: true,
          isVideoEnabled: true,
        })}
      />,
    )

    expect(screen.getByRole('button', { name: /mute microphone/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /turn off camera/i })).toBeInTheDocument()
  })

  it('renders unmute button when audio disabled', function () {
    render(
      <MediaDumb
        {...makeProps({
          status: 'connected',
          isAudioEnabled: false,
          isVideoEnabled: true,
        })}
      />,
    )

    expect(screen.getByRole('button', { name: /unmute microphone/i })).toBeInTheDocument()
  })

  it('renders start video button when video disabled', function () {
    render(
      <MediaDumb
        {...makeProps({
          status: 'connected',
          isAudioEnabled: true,
          isVideoEnabled: false,
        })}
      />,
    )

    expect(screen.getByRole('button', { name: /turn on camera/i })).toBeInTheDocument()
  })

  it('calls onToggleAudio when mute button clicked', async function () {
    const user = userEvent.setup()
    const onToggleAudio = vi.fn()
    render(
      <MediaDumb
        {...makeProps({
          status: 'connected',
          isAudioEnabled: true,
          onToggleAudio,
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /mute microphone/i }))
    expect(onToggleAudio).toHaveBeenCalledOnce()
  })

  it('calls onToggleVideo when stop video button clicked', async function () {
    const user = userEvent.setup()
    const onToggleVideo = vi.fn()
    render(
      <MediaDumb
        {...makeProps({
          status: 'connected',
          isVideoEnabled: true,
          onToggleVideo,
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /turn off camera/i }))
    expect(onToggleVideo).toHaveBeenCalledOnce()
  })

  it('does not render controls in pre-join state', function () {
    render(<MediaDumb {...makeProps({ status: 'pre-join' })} />)
    expect(screen.queryByRole('button', { name: /mute microphone/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /turn off camera/i })).not.toBeInTheDocument()
  })

  it('does not render controls in failed state', function () {
    render(<MediaDumb {...makeProps({ status: 'failed' })} />)
    expect(screen.queryByRole('button', { name: /mute microphone/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /turn off camera/i })).not.toBeInTheDocument()
  })
})
