import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedbackDumb, type FeedbackDumbProps } from './feedback-dumb'
import { makeInterview } from '../session/test-helpers'

function makeProps(overrides?: Partial<FeedbackDumbProps>): FeedbackDumbProps {
  return {
    interview: null,
    isLoading: false,
    errorMessage: null,
    onBack: vi.fn(),
    ...overrides,
  }
}

describe('FeedbackDumb', function () {
  it('renders loading state', function () {
    render(<FeedbackDumb {...makeProps({ isLoading: true })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })

  it('renders safe generic error message', function () {
    render(<FeedbackDumb {...makeProps({ errorMessage: 'Something went wrong' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('shows non-completed message when interview is not completed', function () {
    const interview = makeInterview({ status: 'scheduled' })
    render(<FeedbackDumb {...makeProps({ interview })} />)
    expect(screen.getByText(/feedback not available/i)).toBeInTheDocument()
  })

  it('shows empty state for completed interview with no feedback', function () {
    const interview = makeInterview({ status: 'completed', feedback: null })
    render(<FeedbackDumb {...makeProps({ interview })} />)
    expect(screen.getByText(/no feedback available/i)).toBeInTheDocument()
  })

  it('renders known feedback fields when present', function () {
    const interview = makeInterview({
      status: 'completed',
      feedback: {
        overall_score: 85,
        strengths: ['Good communication', 'Solid problem solving'],
        improvements: ['Time management'],
      },
    })
    render(<FeedbackDumb {...makeProps({ interview })} />)
    expect(screen.getByText('85')).toBeInTheDocument()
    expect(screen.getByText('Good communication')).toBeInTheDocument()
    expect(screen.getByText('Solid problem solving')).toBeInTheDocument()
    expect(screen.getByText('Time management')).toBeInTheDocument()
  })

  it('renders generic fallback for unknown feedback fields', function () {
    const interview = makeInterview({
      status: 'completed',
      feedback: {
        custom_field: 'custom value',
        nested: { key: 'val' },
      },
    })
    render(<FeedbackDumb {...makeProps({ interview })} />)
    expect(screen.getByText(/custom_field/i)).toBeInTheDocument()
    expect(screen.getByText(/custom value/i)).toBeInTheDocument()
  })

  it('renders recording link when recording_url present', function () {
    const interview = makeInterview({
      status: 'completed',
      recording_url: 'https://recordings.test/1.mp4',
    })
    render(<FeedbackDumb {...makeProps({ interview })} />)
    expect(screen.getByRole('link', { name: /recording/i })).toHaveAttribute(
      'href',
      'https://recordings.test/1.mp4',
    )
  })

  it('renders screenshot links when screenshot_urls present', function () {
    const interview = makeInterview({
      status: 'completed',
      screenshot_urls: ['https://screenshots.test/1.png'],
    })
    render(<FeedbackDumb {...makeProps({ interview })} />)
    expect(screen.getByRole('link', { name: /screenshot 1/i })).toHaveAttribute(
      'href',
      'https://screenshots.test/1.png',
    )
  })

  it('calls onBack when back button clicked', async function () {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<FeedbackDumb {...makeProps({ onBack })} />)
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('does not expose credential fields', function () {
    const interview = {
      ...makeInterview({ status: 'completed' }),
      realtime_session_id: 'rt-1',
      excalidraw_room_id: 'room-1',
      excalidraw_key: 'key-1',
    }
    const { container } = render(<FeedbackDumb {...makeProps({ interview })} />)
    expect(container.textContent).not.toContain('rt-1')
    expect(container.textContent).not.toContain('room-1')
    expect(container.textContent).not.toContain('key-1')
  })
})
