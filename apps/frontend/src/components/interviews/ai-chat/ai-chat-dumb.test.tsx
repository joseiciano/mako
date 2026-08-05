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
    onInputChange: vi.fn(),
    onSubmit: vi.fn(),
    onRetry: vi.fn(),
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
