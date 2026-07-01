import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DetailsDumb, type DetailsDumbProps } from './details-dumb'
import { makeInterview } from '../session/test-helpers'

function makeProps(overrides?: Partial<DetailsDumbProps>): DetailsDumbProps {
  return {
    interview: null,
    isLoading: false,
    errorMessage: null,
    canJoin: false,
    canViewFeedback: false,
    onBack: vi.fn(),
    onJoin: vi.fn(),
    onViewFeedback: vi.fn(),
    ...overrides,
  }
}

describe('DetailsDumb', function () {
  it('renders loading state', function () {
    render(<DetailsDumb {...makeProps({ isLoading: true })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading interview details/i)
  })

  it('renders safe generic error message', function () {
    render(<DetailsDumb {...makeProps({ errorMessage: 'Something went wrong' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('does not leak internal error details', function () {
    render(
      <DetailsDumb
        {...makeProps({ errorMessage: 'postgres://secret@internal-db.local failed' })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load/i)
    expect(screen.getByRole('alert')).not.toHaveTextContent('postgres://secret')
  })

  it('renders metadata when interview loaded', function () {
    const interview = makeInterview({
      type: 'coding',
      mode: 'peer_to_peer',
      tier: 'premium',
      status: 'scheduled',
      scheduled_at: '2026-06-20T10:00:00Z',
      scheduler_alias: 'Bob',
      interviewer_alias: 'Alice',
    })
    render(<DetailsDumb {...makeProps({ interview })} />)

    expect(screen.getByText('Coding')).toBeInTheDocument()
    expect(screen.getByText('Peer to Peer')).toBeInTheDocument()
    expect(screen.getByText('Premium')).toBeInTheDocument()
    expect(screen.getByText('Scheduled')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows join button when canJoin is true', function () {
    const interview = makeInterview({ status: 'scheduled' })
    render(<DetailsDumb {...makeProps({ interview, canJoin: true })} />)
    expect(screen.getByRole('button', { name: /join session/i })).toBeInTheDocument()
  })

  it('hides join button when canJoin is false', function () {
    const interview = makeInterview({ status: 'completed' })
    render(<DetailsDumb {...makeProps({ interview, canJoin: false })} />)
    expect(screen.queryByRole('button', { name: /join session/i })).not.toBeInTheDocument()
  })

  it('shows view feedback button when canViewFeedback is true', function () {
    const interview = makeInterview({ status: 'completed' })
    render(<DetailsDumb {...makeProps({ interview, canViewFeedback: true })} />)
    expect(screen.getByRole('button', { name: /view feedback/i })).toBeInTheDocument()
  })

  it('hides view feedback button when canViewFeedback is false', function () {
    const interview = makeInterview({ status: 'scheduled' })
    render(<DetailsDumb {...makeProps({ interview, canViewFeedback: false })} />)
    expect(screen.queryByRole('button', { name: /view feedback/i })).not.toBeInTheDocument()
  })

  it('calls onJoin when join button clicked', async function () {
    const user = userEvent.setup()
    const onJoin = vi.fn()
    const interview = makeInterview({ status: 'scheduled' })
    render(<DetailsDumb {...makeProps({ interview, canJoin: true, onJoin })} />)
    await user.click(screen.getByRole('button', { name: /join session/i }))
    expect(onJoin).toHaveBeenCalledOnce()
  })

  it('calls onViewFeedback when view feedback button clicked', async function () {
    const user = userEvent.setup()
    const onViewFeedback = vi.fn()
    const interview = makeInterview({ status: 'completed' })
    render(
      <DetailsDumb
        {...makeProps({ interview, canViewFeedback: true, onViewFeedback })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /view feedback/i }))
    expect(onViewFeedback).toHaveBeenCalledOnce()
  })

  it('calls onBack when back button clicked', async function () {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<DetailsDumb {...makeProps({ onBack })} />)
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('renders recording link when recording_url present', function () {
    const interview = makeInterview({ recording_url: 'https://recordings.test/1.mp4' })
    render(<DetailsDumb {...makeProps({ interview })} />)
    expect(screen.getByRole('link', { name: /recording/i })).toHaveAttribute(
      'href',
      'https://recordings.test/1.mp4',
    )
  })

  it('does not render recording link when recording_url is null', function () {
    const interview = makeInterview({ recording_url: null })
    render(<DetailsDumb {...makeProps({ interview })} />)
    expect(screen.queryByRole('link', { name: /recording/i })).not.toBeInTheDocument()
  })

  it('renders screenshot links when screenshot_urls present', function () {
    const interview = makeInterview({
      screenshot_urls: ['https://screenshots.test/1.png', 'https://screenshots.test/2.png'],
    })
    render(<DetailsDumb {...makeProps({ interview })} />)
    expect(screen.getByRole('link', { name: /screenshot 1/i })).toHaveAttribute(
      'href',
      'https://screenshots.test/1.png',
    )
    expect(screen.getByRole('link', { name: /screenshot 2/i })).toHaveAttribute(
      'href',
      'https://screenshots.test/2.png',
    )
  })

  it('does not render screenshot links when screenshot_urls is null', function () {
    const interview = makeInterview({ screenshot_urls: null })
    render(<DetailsDumb {...makeProps({ interview })} />)
    expect(screen.queryByRole('link', { name: /screenshot/i })).not.toBeInTheDocument()
  })

  it('renders feedback summary when feedback present', function () {
    const interview = makeInterview({
      status: 'completed',
      feedback: { overall_score: 85, summary: 'Great work' },
    })
    render(<DetailsDumb {...makeProps({ interview, canViewFeedback: true })} />)
    expect(screen.getByText('Great work')).toBeInTheDocument()
  })

  it('renders feedback empty state when feedback is null', function () {
    const interview = makeInterview({ status: 'completed', feedback: null })
    render(<DetailsDumb {...makeProps({ interview, canViewFeedback: true })} />)
    expect(screen.getByText(/no feedback available/i)).toBeInTheDocument()
  })

  it('does not expose credential fields', function () {
    const interview = {
      ...makeInterview(),
      realtime_session_id: 'rt-1',
      excalidraw_room_id: 'room-1',
      excalidraw_key: 'key-1',
    }
    const { container } = render(<DetailsDumb {...makeProps({ interview })} />)
    expect(container.textContent).not.toContain('rt-1')
    expect(container.textContent).not.toContain('room-1')
    expect(container.textContent).not.toContain('key-1')
  })
})
