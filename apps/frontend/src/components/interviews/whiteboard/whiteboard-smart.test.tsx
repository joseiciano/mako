import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WhiteboardSmart } from './whiteboard-smart'
import type { WhiteboardSmartProps } from './whiteboard-types'
import {
  clearAllWhiteboardProvisionHandles,
  createWhiteboardProvisionHandle,
} from './whiteboard-provision-store'

vi.mock('./whiteboard-runtime', function () {
  return {
    WhiteboardRuntime: vi.fn(function MockRuntime() {
      return <div data-testid="whiteboard-runtime" />
    }),
  }
})

import { WhiteboardRuntime } from './whiteboard-runtime'

function makeProps(
  overrides?: Partial<WhiteboardSmartProps>,
): WhiteboardSmartProps {
  return {
    connectionStatus: 'idle',
    errorMessage: null,
    provisionedWhiteboardHandle: createWhiteboardProvisionHandle({
      mode: 'ai_led',
      realtime: { realtime_session_id: 'rt-1', token: 'token-1' },
      excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: 'key-1' },
    }),
    onConnecting: vi.fn(),
    onConnected: vi.fn(),
    onReconnecting: vi.fn(),
    onFailed: vi.fn(),
    onRetryJoin: vi.fn(),
    ...overrides,
  }
}

describe('WhiteboardSmart', function () {
  beforeEach(function () {
    vi.clearAllMocks()
  })

  afterEach(function () {
    vi.restoreAllMocks()
    clearAllWhiteboardProvisionHandles()
  })

  it('calls onConnecting when idle with valid config', async function () {
    const onConnecting = vi.fn()
    render(<WhiteboardSmart {...makeProps({ onConnecting })} />)

    await waitFor(function () {
      expect(onConnecting).toHaveBeenCalledOnce()
    })
  })

  it('does not call onConnecting when provisionedWhiteboardHandle is null', function () {
    const onConnecting = vi.fn()
    render(
      <WhiteboardSmart
        {...makeProps({ provisionedWhiteboardHandle: null, onConnecting })}
      />,
    )
    expect(onConnecting).not.toHaveBeenCalled()
  })

  it('renders runtime when connecting with valid config', function () {
    render(
      <WhiteboardSmart {...makeProps({ connectionStatus: 'connecting' })} />,
    )
    expect(screen.getByTestId('whiteboard-runtime')).toBeInTheDocument()
  })

  it('renders runtime when connected', function () {
    render(
      <WhiteboardSmart {...makeProps({ connectionStatus: 'connected' })} />,
    )
    expect(screen.getByTestId('whiteboard-runtime')).toBeInTheDocument()
  })

  it('renders runtime when reconnecting', function () {
    render(
      <WhiteboardSmart
        {...makeProps({ connectionStatus: 'reconnecting' })}
      />,
    )
    expect(screen.getByTestId('whiteboard-runtime')).toBeInTheDocument()
  })

  it('does not render runtime when failed', function () {
    render(
      <WhiteboardSmart
        {...makeProps({ connectionStatus: 'failed', errorMessage: 'Lost connection' })}
      />,
    )
    expect(screen.queryByTestId('whiteboard-runtime')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Lost connection')
  })

  it('renders runtime when idle because provisioned config starts connecting', function () {
    render(<WhiteboardSmart {...makeProps({ connectionStatus: 'idle' })} />)
    expect(screen.getByTestId('whiteboard-runtime')).toBeInTheDocument()
  })

  it('passes only collaboration flag to runtime props', function () {
    render(
      <WhiteboardSmart {...makeProps({ connectionStatus: 'connecting' })} />,
    )
    const runtimeProps = vi.mocked(WhiteboardRuntime).mock.calls[0][0]
    expect(runtimeProps).toEqual(
      expect.objectContaining({
        collaborationEnabled: true,
      }),
    )
    expect('config' in runtimeProps).toBe(false)
    expect(JSON.stringify(runtimeProps)).not.toContain('token-1')
    expect(JSON.stringify(runtimeProps)).not.toContain('key-1')
  })

  it('wires runtime callbacks to parent callbacks', function () {
    const onConnected = vi.fn()
    const onReconnecting = vi.fn()
    const onFailed = vi.fn()
    render(
      <WhiteboardSmart
        {...makeProps({
          connectionStatus: 'connecting',
          onConnected,
          onReconnecting,
          onFailed,
        })}
      />,
    )
    const callProps = vi.mocked(WhiteboardRuntime).mock.calls[0][0]
    expect(callProps.onConnected).toBe(onConnected)
    expect(callProps.onReconnecting).toBe(onReconnecting)
  })

  it('calls onRetryJoin when retry button clicked', async function () {
    const user = userEvent.setup()
    const onRetryJoin = vi.fn()
    render(
      <WhiteboardSmart
        {...makeProps({
          connectionStatus: 'failed',
          errorMessage: 'Failed',
          onRetryJoin,
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetryJoin).toHaveBeenCalledOnce()
  })

  it('does not auto-call onRetryJoin on failure', function () {
    const onRetryJoin = vi.fn()
    render(
      <WhiteboardSmart
        {...makeProps({
          connectionStatus: 'failed',
          errorMessage: 'Failed',
          onRetryJoin,
        })}
      />,
    )
    expect(onRetryJoin).not.toHaveBeenCalled()
  })

  it('does not render room key or room id in DOM', function () {
    const { container } = render(
      <WhiteboardSmart
        {...makeProps({ connectionStatus: 'failed', errorMessage: 'Failed' })}
      />,
    )
    expect(container.textContent).not.toContain('room-1')
    expect(container.textContent).not.toContain('key-1')
  })

  it('shows failed fallback when provisionedWhiteboardHandle is null', function () {
    render(
      <WhiteboardSmart
        {...makeProps({ provisionedWhiteboardHandle: null })}
      />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
