import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AIChatDumb } from './ai-chat-dumb'
import type { AIChatDumbProps, AIChatMessage } from './ai-chat-types'

function makeMessage(role: 'user' | 'assistant', content: string, isError?: boolean): AIChatMessage {
  return { id: `${role}-${content}`, role, content, isError }
}

function makeProps(overrides?: Partial<AIChatDumbProps>): AIChatDumbProps {
  return {
    messages: [],
    inputValue: '',
    submitState: 'idle',
    errorMessage: null,
    disabled: false,
    canRetry: false,
    retryLimitReached: false,
    voiceState: 'idle',
    voiceErrorMessage: null,
    voiceSupported: true,
    voiceInterimTranscript: '',
    playbackState: 'idle',
    playbackSupported: true,
    playbackMuted: false,
    canReplay: false,
    playbackErrorMessage: null,
    onInputChange: vi.fn(),
    onSubmit: vi.fn(),
    onRetry: vi.fn(),
    onVoiceToggle: vi.fn(),
    onReplay: vi.fn(),
    onStopPlayback: vi.fn(),
    onToggleMuted: vi.fn(),
    ...overrides,
  }
}

describe('AIChatDumb', function () {
  it('renders panel title and empty-state guidance', function () {
    render(<AIChatDumb {...makeProps()} />)
    expect(screen.getByText('AI Coach Chat')).toBeInTheDocument()
    expect(screen.getByText(/your current whiteboard is included/i)).toBeInTheDocument()
  })

  it('renders user and assistant messages', function () {
    render(
      <AIChatDumb
        {...makeProps({
          messages: [
            makeMessage('user', 'Should I add auth?'),
            makeMessage('assistant', 'Yes, consider JWT-based auth.'),
          ],
        })}
      />,
    )
    expect(screen.getByText('Should I add auth?')).toBeInTheDocument()
    expect(screen.getByText('Yes, consider JWT-based auth.')).toBeInTheDocument()
  })

  it('shows loading status while sending', function () {
    render(
      <AIChatDumb
        {...makeProps({
          messages: [makeMessage('user', 'hi')],
          submitState: 'sending',
        })}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/AI interviewer is thinking/i)
  })

  it('shows error message and retry button on error state', function () {
    render(
      <AIChatDumb
        {...makeProps({
          messages: [makeMessage('user', 'hi', true)],
          submitState: 'error',
          errorMessage: 'Unable to get an AI response.',
          canRetry: true,
        })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to get an AI response.')
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('does not show a retry button in error state without retry intent', function () {
    render(
      <AIChatDumb
        {...makeProps({
          submitState: 'error',
          errorMessage: 'Whiteboard is still loading.',
          canRetry: false,
        })}
      />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('does not show retry button when not in error state', function () {
    render(<AIChatDumb {...makeProps()} />)
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })

  it('calls onSubmit when send clicked', async function () {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <AIChatDumb
        {...makeProps({
          inputValue: 'Hello',
          onSubmit,
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /send/i }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('does not call onSubmit for empty input', async function () {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<AIChatDumb {...makeProps({ inputValue: '', onSubmit })} />)
    await user.click(screen.getByRole('button', { name: /send/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onRetry when retry button clicked', async function () {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <AIChatDumb
        {...makeProps({
          submitState: 'error',
          errorMessage: 'Failed',
          canRetry: true,
          onRetry,
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('calls onInputChange when typing', async function () {
    const user = userEvent.setup()
    const onInputChange = vi.fn()
    render(<AIChatDumb {...makeProps({ onInputChange })} />)
    const textarea = screen.getByLabelText(/message the ai interviewer/i)
    await user.type(textarea, 'ab')
    expect(onInputChange).toHaveBeenCalled()
  })

  it('disables send and textarea while sending', function () {
    render(
      <AIChatDumb
        {...makeProps({
          inputValue: 'hi',
          submitState: 'sending',
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled()
    expect(screen.getByLabelText(/message the ai interviewer/i)).toBeDisabled()
  })
})

describe('AIChatDumb voice input', function () {
  it('renders a mic control with an idle hint when voice is supported', function () {
    render(<AIChatDumb {...makeProps()} />)
    expect(screen.getByRole('button', { name: /start voice input/i })).toBeInTheDocument()
    expect(screen.getByText(/use the microphone to speak your question/i)).toBeInTheDocument()
  })

  it('toggles the mic button while listening', function () {
    render(<AIChatDumb {...makeProps({ voiceState: 'listening' })} />)
    expect(screen.getByRole('button', { name: /stop voice input/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('status')).toHaveTextContent(/listening/i)
  })

  it('shows the interim transcript while listening', function () {
    render(
      <AIChatDumb
        {...makeProps({
          voiceState: 'listening',
          voiceInterimTranscript: 'Speak',
        })}
      />,
    )
    expect(screen.getByText('Speak')).toBeInTheDocument()
  })

  it('shows the transcribing state and disables the mic', function () {
    render(<AIChatDumb {...makeProps({ voiceState: 'transcribing' })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/transcribing/i)
    expect(screen.getByRole('button', { name: /start voice input/i })).toBeDisabled()
  })

  it('shows the ready-to-send state', function () {
    render(<AIChatDumb {...makeProps({ voiceState: 'ready-to-send' })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/speech captured/i)
  })

  it('shows the voice failure message', function () {
    render(
      <AIChatDumb
        {...makeProps({
          voiceState: 'failed',
          voiceErrorMessage: 'Microphone access was denied.',
        })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/microphone access was denied/i)
  })

  it('hides the mic and explains when voice is unsupported', function () {
    render(<AIChatDumb {...makeProps({ voiceSupported: false })} />)
    expect(screen.queryByRole('button', { name: /voice input/i })).not.toBeInTheDocument()
    expect(screen.getByText(/speech-to-text is not supported/i)).toBeInTheDocument()
  })

  it('calls onVoiceToggle when the mic is clicked', async function () {
    const user = userEvent.setup()
    const onVoiceToggle = vi.fn()
    render(<AIChatDumb {...makeProps({ onVoiceToggle })} />)
    await user.click(screen.getByRole('button', { name: /start voice input/i }))
    expect(onVoiceToggle).toHaveBeenCalledOnce()
  })

  it('disables the mic while a message is sending', function () {
    render(
      <AIChatDumb
        {...makeProps({
          inputValue: 'hi',
          submitState: 'sending',
          voiceState: 'listening',
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /voice input/i })).toBeDisabled()
  })

  it('disables the mic while the AI reply is being spoken aloud', function () {
    render(
      <AIChatDumb
        {...makeProps({
          playbackSupported: true,
          playbackState: 'speaking',
          voiceState: 'idle',
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /start voice input/i })).toBeDisabled()
  })

  it('keeps the mic disabled while speaking even when listening is active', function () {
    render(
      <AIChatDumb
        {...makeProps({
          playbackSupported: true,
          playbackState: 'speaking',
          voiceState: 'listening',
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /stop voice input/i })).toBeDisabled()
  })

  it('re-enables the mic once reply playback has stopped', function () {
    render(
      <AIChatDumb
        {...makeProps({
          playbackSupported: true,
          playbackState: 'idle',
          voiceState: 'idle',
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /start voice input/i })).not.toBeDisabled()
  })
})

describe('AIChatDumb reply playback', function () {
  it('renders playback controls when playback is supported', function () {
    render(
      <AIChatDumb
        {...makeProps({
          playbackSupported: true,
          canReplay: true,
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /replay/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stop playback/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mute voice/i })).toBeInTheDocument()
  })

  it('disables replay and stop before any reply has been spoken', function () {
    render(<AIChatDumb {...makeProps({ playbackSupported: true, canReplay: false })} />)
    expect(screen.getByRole('button', { name: /replay/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /stop playback/i })).toBeDisabled()
  })

  it('shows a speaking status while playback is active', function () {
    render(
      <AIChatDumb
        {...makeProps({
          playbackSupported: true,
          playbackState: 'speaking',
        })}
      />,
    )
    expect(screen.getByText(/playing reply aloud/i)).toBeInTheDocument()
  })

  it('shows a playback error when synthesis fails', function () {
    render(
      <AIChatDumb
        {...makeProps({
          playbackSupported: true,
          playbackErrorMessage: 'Playback could not reach the network.',
        })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/network/i)
  })

  it('explains the typed fallback when playback is unsupported', function () {
    render(<AIChatDumb {...makeProps({ playbackSupported: false })} />)
    expect(screen.getByText(/voice playback is not supported/i)).toBeInTheDocument()
  })

  it('calls the playback handlers from the controls', async function () {
    const user = userEvent.setup()
    const onReplay = vi.fn()
    const onStopPlayback = vi.fn()
    const onToggleMuted = vi.fn()
    render(
      <AIChatDumb
        {...makeProps({
          playbackSupported: true,
          canReplay: true,
          playbackState: 'speaking',
          onReplay,
          onStopPlayback,
          onToggleMuted,
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /replay/i }))
    await user.click(screen.getByRole('button', { name: /stop playback/i }))
    await user.click(screen.getByRole('button', { name: /mute voice/i }))
    expect(onReplay).toHaveBeenCalledOnce()
    expect(onStopPlayback).toHaveBeenCalledOnce()
    expect(onToggleMuted).toHaveBeenCalledOnce()
  })

  it('shows the unmute state when muted', function () {
    render(
      <AIChatDumb
        {...makeProps({
          playbackSupported: true,
          playbackMuted: true,
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /unmute voice/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('keeps typed input usable while playback is speaking', function () {
    render(
      <AIChatDumb
        {...makeProps({
          playbackSupported: true,
          playbackState: 'speaking',
          inputValue: 'hi',
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /send/i })).not.toBeDisabled()
    expect(screen.getByLabelText(/message the ai interviewer/i)).not.toBeDisabled()
  })
})
