import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WhiteboardDumb } from './whiteboard-dumb'
import type { WhiteboardDumbProps } from './whiteboard-types'

function makeProps(
  overrides?: Partial<WhiteboardDumbProps>,
): WhiteboardDumbProps {
  return {
    status: 'idle',
    errorMessage: null,
    onRetryJoin: vi.fn(),
    canvasSlot: null,
    ...overrides,
  }
}

describe('WhiteboardDumb', function () {
  it('renders whiteboard heading', function () {
    render(<WhiteboardDumb {...makeProps()} />)
    expect(screen.getByText('Whiteboard')).toBeInTheDocument()
  })

  it('renders loading message when connecting', function () {
    render(<WhiteboardDumb {...makeProps({ status: 'connecting' })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading whiteboard/i)
  })

  it('renders reconnecting message when reconnecting', function () {
    render(<WhiteboardDumb {...makeProps({ status: 'reconnecting' })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/reconnecting/i)
  })

  it('renders failed fallback with retry button when failed', function () {
    render(
      <WhiteboardDumb
        {...makeProps({
          status: 'failed',
          errorMessage: 'Connection lost',
        })}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Connection lost')
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('renders default error message when failed with no errorMessage', function () {
    render(<WhiteboardDumb {...makeProps({ status: 'failed' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/connection failed/i)
  })

  it('calls onRetryJoin when retry button clicked', async function () {
    const user = userEvent.setup()
    const onRetryJoin = vi.fn()
    render(
      <WhiteboardDumb
        {...makeProps({ status: 'failed', onRetryJoin })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetryJoin).toHaveBeenCalledOnce()
  })

  it('renders canvas slot when connected', function () {
    render(
      <WhiteboardDumb
        {...makeProps({
          status: 'connected',
          canvasSlot: <div data-testid="canvas" />,
        })}
      />,
    )
    expect(screen.getByTestId('canvas')).toBeInTheDocument()
  })

  it('renders canvas slot when connecting', function () {
    render(
      <WhiteboardDumb
        {...makeProps({
          status: 'connecting',
          canvasSlot: <div data-testid="canvas" />,
        })}
      />,
    )
    expect(screen.getByTestId('canvas')).toBeInTheDocument()
  })

  it('does not render canvas slot when failed', function () {
    render(
      <WhiteboardDumb
        {...makeProps({
          status: 'failed',
          canvasSlot: <div data-testid="canvas" />,
        })}
      />,
    )
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument()
  })

  it('does not render canvas slot when idle', function () {
    render(
      <WhiteboardDumb
        {...makeProps({
          status: 'idle',
          canvasSlot: <div data-testid="canvas" />,
        })}
      />,
    )
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument()
  })
})
