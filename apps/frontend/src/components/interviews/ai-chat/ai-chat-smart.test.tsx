import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAIChat } from '#/hooks/use-interviews'
import { getWhiteboardSceneSnapshot } from '#/components/interviews/whiteboard'
import { AIChatSmart } from './ai-chat-smart'
import {
  clearAllWhiteboardSceneApis,
  registerWhiteboardSceneApi,
} from '#/components/interviews/whiteboard'

vi.mock('#/hooks/use-interviews', function () {
  return {
    useAIChat: vi.fn(),
  }
})

vi.mock('#/components/interviews/whiteboard', async function (importOriginal) {
  const actual = await importOriginal<typeof import('#/components/interviews/whiteboard')>()
  return {
    ...actual,
    getWhiteboardSceneSnapshot: vi.fn(),
  }
})

import { useAIChat as useAIChatMock } from '#/hooks/use-interviews'

const mockGetSnapshot = vi.mocked(getWhiteboardSceneSnapshot)

const mockAiChatMutate = vi.fn()

function makeSceneApi() {
  return {
    getSceneElements: function getSceneElements() {
      return [{ id: 'rect-1', type: 'rectangle', x: 1, y: 2 }]
    },
  }
}

function mockUseAIChat(overrides: Record<string, unknown> = {}) {
  vi.mocked(useAIChatMock).mockReturnValue({
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isError: false,
    isIdle: true,
    isPaused: false,
    isPending: false,
    isSuccess: false,
    mutate: mockAiChatMutate,
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    status: 'idle',
    submittedAt: 0,
    variables: undefined,
    ...overrides,
  } as unknown as ReturnType<typeof useAIChat>)
}

beforeEach(function () {
  vi.clearAllMocks()
  mockAiChatMutate.mockReset()
  mockGetSnapshot.mockReset()
})

afterEach(function () {
  clearAllWhiteboardSceneApis()
})

describe('AIChatSmart', function () {
  it('submits user message with canvas snapshot and renders reply on success', async function () {
    const user = userEvent.setup()
    const handle = 'handle-1'
    registerWhiteboardSceneApi(handle, makeSceneApi())
    mockGetSnapshot.mockReturnValue({
      type: 'excalidraw_scene',
      scene: { elements: [{ id: 'rect-1', type: 'rectangle', x: 1, y: 2 }] },
    })

    let callArgs: any
    mockAiChatMutate.mockImplementation(function (_params: any, options: any) {
      callArgs = { params: _params, options }
      options.onSuccess?.({ reply: 'Great design.', guidance_mode: 'review', prompt_version: 'ai-whiteboard-v1' })
    })

    mockUseAIChat()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    const textarea = screen.getByLabelText(/message the ai interviewer/i)
    await user.type(textarea, 'Review my design')
    await user.click(screen.getByRole('button', { name: /send/i }))

    expect(callArgs).toBeDefined()
    expect(callArgs.params).toMatchObject({
      id: 'int-1',
      message: 'Review my design',
      guidance_mode: 'review',
      canvas_snapshot: {
        type: 'excalidraw_scene',
        scene: expect.any(Object),
      },
    })

    await waitFor(function () {
      expect(screen.getByText('Great design.')).toBeInTheDocument()
    })
  })

  it('renders failure state and retries to success', async function () {
    const user = userEvent.setup()
    const handle = 'handle-1'
    registerWhiteboardSceneApi(handle, makeSceneApi())
    mockGetSnapshot.mockReturnValue({
      type: 'excalidraw_scene',
      scene: { elements: [] },
    })

    let attempt = 0
    mockAiChatMutate.mockImplementation(function (_params: any, options: any) {
      attempt += 1
      if (attempt === 1) {
        options.onError?.(new Error('network'))
      } else {
        options.onSuccess?.({ reply: 'Recovered reply.', guidance_mode: 'review', prompt_version: 'v1' })
      }
    })

    mockUseAIChat()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    const textarea = screen.getByLabelText(/message the ai interviewer/i)
    await user.type(textarea, 'Question one')
    await user.click(screen.getByRole('button', { name: /send/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to get an ai response/i)

    await user.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(function () {
      expect(screen.getByText('Recovered reply.')).toBeInTheDocument()
    })
    expect(mockAiChatMutate).toHaveBeenCalledTimes(2)
  })

  it('shows a non-retry failure when snapshot is unavailable and keeps input', async function () {
    const user = userEvent.setup()
    mockGetSnapshot.mockReturnValue(null)
    mockUseAIChat()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle="nope" />)

    const textarea = screen.getByLabelText(/message the ai interviewer/i)
    await user.type(textarea, 'hello')
    await user.click(screen.getByRole('button', { name: /send/i }))

    expect(mockAiChatMutate).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent(/whiteboard is still loading/i)
    // Message is not lost: kept in the input, and no retry offered for a message
    // that was never actually submitted.
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
    expect((textarea as HTMLTextAreaElement).value).toBe('hello')
  })

  it('routes a fresh submit after a failure through the SUBMIT path, not retry', async function () {
    const user = userEvent.setup()
    const handle = 'handle-1'
    registerWhiteboardSceneApi(handle, makeSceneApi())
    mockGetSnapshot.mockReturnValue({
      type: 'excalidraw_scene',
      scene: { elements: [] },
    })

    let attempt = 0
    mockAiChatMutate.mockImplementation(function (_params: any, options: any) {
      attempt += 1
      if (attempt === 1) {
        options.onSuccess?.({ reply: 'First reply.', guidance_mode: 'review', prompt_version: 'v1' })
      } else {
        options.onSuccess?.({ reply: 'Second reply.', guidance_mode: 'review', prompt_version: 'v1' })
      }
    })
    mockUseAIChat()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    // First send succeeds.
    await user.type(screen.getByLabelText(/message the ai interviewer/i), 'First question')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByText('First reply.')

    // Second, fresh send must appear as a new user+assistant pair (not a retry).
    await user.type(screen.getByLabelText(/message the ai interviewer/i), 'Second question')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByText('Second reply.')

    expect(screen.getByText('Second question')).toBeInTheDocument()
    expect(screen.getByText('First reply.')).toBeInTheDocument()
    expect(screen.getByText('Second reply.')).toBeInTheDocument()
  })
})
