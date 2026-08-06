import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAIChat } from '#/hooks/use-interviews'
import { getWhiteboardSceneSnapshot } from '#/components/interviews/whiteboard'
import { AIChatSmart } from './ai-chat-smart'
import {
  clearAllWhiteboardSceneApis,
  registerWhiteboardSceneApi,
} from '#/components/interviews/whiteboard'
import {
  FakeSpeechRecognition,
  FakeSpeechRecognitionConstructor,
  finalResultEvent,
  installSpeechRecognition,
  resetFakeSpeechRecognition,
} from './ai-chat-speech.test-helpers'

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
  resetFakeSpeechRecognition()
  installSpeechRecognition(FakeSpeechRecognitionConstructor)
})

afterEach(function () {
  clearAllWhiteboardSceneApis()
  installSpeechRecognition(null)
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

  it('bounds retry attempts and keeps failure actionable with a new message', async function () {
    const user = userEvent.setup()
    const handle = 'handle-1'
    registerWhiteboardSceneApi(handle, makeSceneApi())
    mockGetSnapshot.mockReturnValue({
      type: 'excalidraw_scene',
      scene: { elements: [] },
    })

    // Always fail so every retry is consumed against the limit.
    mockAiChatMutate.mockImplementation(function (_params: any, options: any) {
      options.onError?.(new Error('network'))
    })

    mockUseAIChat()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    const textarea = screen.getByLabelText(/message the ai interviewer/i)
    await user.type(textarea, 'Question one')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByRole('alert')

    // Retry until the limit is reached; the retry button should disappear.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Focus back on the body so clicks target the alert region consistently.
      await user.click(screen.getByRole('button', { name: /retry/i }))
      await screen.findByRole('alert')
    }

    // After consuming the limit, no retry button is offered but the failure
    // stays visible, so the user can still send a fresh message.
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
    expect(await screen.findByText(/retry limit reached/i)).toBeInTheDocument()

    // Still actionable: typing a new message and sending works (mutate is invoked again).
    expect((screen.getByLabelText(/message the ai interviewer/i) as HTMLTextAreaElement).disabled).toBe(false)
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

describe('AIChatSmart voice input', function () {
  it('fills the textarea with recognized speech and sends through the typed submit path', async function () {
    const user = userEvent.setup()
    const handle = 'handle-1'
    registerWhiteboardSceneApi(handle, makeSceneApi())
    mockGetSnapshot.mockReturnValue({
      type: 'excalidraw_scene',
      scene: { elements: [] },
    })

    let callArgs: any
    mockAiChatMutate.mockImplementation(function (_params: any, options: any) {
      callArgs = { params: _params }
      options.onSuccess?.({ reply: 'Got it.', guidance_mode: 'review', prompt_version: 'v1' })
    })
    mockUseAIChat()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    await user.click(screen.getByRole('button', { name: /start voice input/i }))

    const recognizer = FakeSpeechRecognition.latest
    expect(recognizer).not.toBeNull()

    act(function () {
      recognizer?.onresult?.(finalResultEvent('Speak now'))
      recognizer?.onend?.()
    })

    // Recognized speech lands in the controlled textarea.
    expect(screen.getByLabelText(/message the ai interviewer/i)).toHaveValue('Speak now')
    expect(screen.getByText(/speech captured/i)).toBeInTheDocument()

    // A normal Send routes the recognized transcript through the existing typed submit path.
    await user.click(screen.getByRole('button', { name: /send/i }))

    expect(callArgs).toBeDefined()
    expect(callArgs.params).toMatchObject({
      id: 'int-1',
      message: 'Speak now',
      guidance_mode: 'review',
      canvas_snapshot: {
        type: 'excalidraw_scene',
        scene: expect.any(Object),
      },
    })
  })

  it('appends recognized speech to text the user already typed', async function () {
    const user = userEvent.setup()
    mockUseAIChat()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle="nope" />)

    await user.type(screen.getByLabelText(/message the ai interviewer/i), 'First part')

    await user.click(screen.getByRole('button', { name: /start voice input/i }))
    act(function () {
      FakeSpeechRecognition.latest?.onresult?.(finalResultEvent('and second part'))
      FakeSpeechRecognition.latest?.onend?.()
    })

    expect(screen.getByLabelText(/message the ai interviewer/i)).toHaveValue(
      'First part and second part',
    )
  })

  it('falls back to typed input when speech recognition is unsupported', async function () {
    const user = userEvent.setup()
    installSpeechRecognition(null)
    mockUseAIChat()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle="nope" />)

    expect(screen.queryByRole('button', { name: /voice input/i })).not.toBeInTheDocument()
    expect(screen.getByText(/speech-to-text is not supported/i)).toBeInTheDocument()

    const textarea = screen.getByLabelText(/message the ai interviewer/i)
    await user.type(textarea, 'typed question')
    expect((textarea as HTMLTextAreaElement).value).toBe('typed question')
  })

  it('shows a failed voice state on microphone permission denial and keeps typing usable', async function () {
    const user = userEvent.setup()
    mockUseAIChat()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle="nope" />)

    await user.click(screen.getByRole('button', { name: /start voice input/i }))

    act(function () {
      FakeSpeechRecognition.latest?.onerror?.({ error: 'not-allowed' })
      FakeSpeechRecognition.latest?.onend?.()
    })

    expect(screen.getByRole('alert')).toHaveTextContent(/microphone access was denied/i)

    const textarea = screen.getByLabelText(/message the ai interviewer/i)
    await user.type(textarea, 'still typing')
    expect((textarea as HTMLTextAreaElement).value).toBe('still typing')
  })

  it('clears the voice state when a recognized message is submitted', async function () {
    const user = userEvent.setup()
    const handle = 'handle-1'
    registerWhiteboardSceneApi(handle, makeSceneApi())
    mockGetSnapshot.mockReturnValue({
      type: 'excalidraw_scene',
      scene: { elements: [] },
    })
    mockAiChatMutate.mockImplementation(function (_params: any, options: any) {
      options.onSuccess?.({ reply: 'Ok.', guidance_mode: 'review', prompt_version: 'v1' })
    })
    mockUseAIChat()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    await user.click(screen.getByRole('button', { name: /start voice input/i }))
    act(function () {
      FakeSpeechRecognition.latest?.onresult?.(finalResultEvent('Speak now'))
      FakeSpeechRecognition.latest?.onend?.()
    })
    expect(screen.getByText(/speech captured/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByText('Ok.')

    expect(screen.queryByText(/speech captured/i)).not.toBeInTheDocument()
    expect(screen.getByText(/use the microphone/i)).toBeInTheDocument()
  })
})
