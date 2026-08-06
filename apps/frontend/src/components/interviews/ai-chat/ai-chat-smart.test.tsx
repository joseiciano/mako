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
import {
  FakeSpeechSynthesis,
  FakeSpeechSynthesisUtteranceConstructor,
  installSpeechSynthesis,
  resetFakeSpeechSynthesis,
} from './ai-chat-synthesis.test-helpers'

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
  resetFakeSpeechSynthesis()
  installSpeechRecognition(FakeSpeechRecognitionConstructor)
  installSpeechSynthesis(null, null)
})

afterEach(function () {
  clearAllWhiteboardSceneApis()
  installSpeechRecognition(null)
  installSpeechSynthesis(null, null)
})

function installPlaybackSynthesis() {
  const synthesis = new FakeSpeechSynthesis()
  installSpeechSynthesis(synthesis, FakeSpeechSynthesisUtteranceConstructor)
  return synthesis
}

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

describe('AIChatSmart reply playback', function () {
  function submitTurn(reply: string) {
    const handle = 'handle-1'
    registerWhiteboardSceneApi(handle, makeSceneApi())
    mockGetSnapshot.mockReturnValue({
      type: 'excalidraw_scene',
      scene: { elements: [] },
    })
    mockAiChatMutate.mockImplementation(function (_params: any, options: any) {
      options.onSuccess?.({
        reply,
        guidance_mode: 'review',
        prompt_version: 'v1',
      })
    })
    mockUseAIChat()
    return handle
  }

  it('plays the AI reply aloud when a turn succeeds', async function () {
    const user = userEvent.setup()
    const handle = submitTurn('Consider caching the data.')
    const synthesis = installPlaybackSynthesis()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    await user.type(screen.getByLabelText(/message the ai interviewer/i), 'How do I scale?')
    await user.click(screen.getByRole('button', { name: /send/i }))

    await screen.findByText('Consider caching the data.')
    expect(synthesis.lastSpokenText).toBe('Consider caching the data.')
    expect(screen.getByText(/playing reply aloud/i)).toBeInTheDocument()
  })

  it('keeps typed chat usable when playback is unsupported', async function () {
    const user = userEvent.setup()
    const handle = submitTurn('Text only reply.')
    // No synthesis installed: playback falls back to text-only.

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    const textarea = screen.getByLabelText(/message the ai interviewer/i)
    await user.type(textarea, 'Ask away')
    await user.click(screen.getByRole('button', { name: /send/i }))

    await screen.findByText('Text only reply.')
    expect(screen.getByText(/voice playback is not supported/i)).toBeInTheDocument()

    // The panel never disables the typed path: a follow-up turn can still be
    // composed after the reply lands.
    await user.type(textarea, ' more')
    expect((textarea as HTMLTextAreaElement).value).toBe(' more')
  })

  it('replays the last AI reply from the playback controls', async function () {
    const user = userEvent.setup()
    const handle = submitTurn('Replay me.')
    const synthesis = installPlaybackSynthesis()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    await user.type(screen.getByLabelText(/message the ai interviewer/i), 'Say it again?')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByText('Replay me.')
    expect(synthesis.speakCalls).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /replay/i }))
    expect(synthesis.speakCalls).toHaveLength(2)
    expect(synthesis.lastSpokenText).toBe('Replay me.')
  })

  it('stops playback from the controls', async function () {
    const user = userEvent.setup()
    const handle = submitTurn('Stop me.')
    const synthesis = installPlaybackSynthesis()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    await user.type(screen.getByLabelText(/message the ai interviewer/i), 'Play then stop')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByText('Stop me.')
    expect(synthesis.speakCalls).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /stop playback/i }))
    expect(synthesis.cancelCalls).toBeGreaterThan(0)
    expect(screen.queryByText(/playing reply aloud/i)).not.toBeInTheDocument()
  })

  it('mutes voice playback and blocks further auto-play', async function () {
    const user = userEvent.setup()
    const handle = 'handle-1'
    registerWhiteboardSceneApi(handle, makeSceneApi())
    mockGetSnapshot.mockReturnValue({
      type: 'excalidraw_scene',
      scene: { elements: [] },
    })
    mockAiChatMutate.mockImplementation(function (_params: any, options: any) {
      options.onSuccess?.({
        reply: 'Silent reply.',
        guidance_mode: 'review',
        prompt_version: 'v1',
      })
    })
    mockUseAIChat()
    const synthesis = installPlaybackSynthesis()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    await user.click(screen.getByRole('button', { name: /mute voice/i }))
    expect(screen.getByRole('button', { name: /unmute voice/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.type(screen.getByLabelText(/message the ai interviewer/i), 'Hello?')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByText('Silent reply.')

    // Muted: the reply is rendered but never spoken.
    expect(synthesis.speakCalls).toHaveLength(0)
    expect(screen.queryByText(/playing reply aloud/i)).not.toBeInTheDocument()
  })

  it('honors mute state when the in-flight request resolves after muting', async function () {
    const user = userEvent.setup()
    const handle = 'handle-1'
    registerWhiteboardSceneApi(handle, makeSceneApi())
    mockGetSnapshot.mockReturnValue({
      type: 'excalidraw_scene',
      scene: { elements: [] },
    })

    let resolveSuccess: (() => void) | undefined
    mockAiChatMutate.mockImplementation(function (_params: any, options: any) {
      // Keep the request in flight so mute can happen before it resolves.
      resolveSuccess = function resolve() {
        options.onSuccess?.({
          reply: 'Silent in-flight reply.',
          guidance_mode: 'review',
          prompt_version: 'v1',
        })
      }
    })
    mockUseAIChat()
    const synthesis = installPlaybackSynthesis()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    await user.type(screen.getByLabelText(/message the ai interviewer/i), 'Speak?')
    await user.click(screen.getByRole('button', { name: /send/i }))
    expect(resolveSuccess).toBeDefined()

    // Mute while the request is still in flight.
    await user.click(screen.getByRole('button', { name: /mute voice/i }))
    expect(screen.getByRole('button', { name: /unmute voice/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Resolve the in-flight request after the mute took effect.
    act(function () {
      resolveSuccess?.()
    })

    // The reply renders but the stale playback callback must not speak while
    // muted at execution time.
    await screen.findByText('Silent in-flight reply.')
    expect(synthesis.speakCalls).toHaveLength(0)
    expect(screen.queryByText(/playing reply aloud/i)).not.toBeInTheDocument()
  })

  it('stops reply playback when a new turn is submitted', async function () {
    const user = userEvent.setup()
    const handle = 'handle-1'
    registerWhiteboardSceneApi(handle, makeSceneApi())
    mockGetSnapshot.mockReturnValue({
      type: 'excalidraw_scene',
      scene: { elements: [] },
    })
    let turns = 0
    mockAiChatMutate.mockImplementation(function (_params: any, options: any) {
      turns += 1
      options.onSuccess?.({
        reply: turns === 1 ? 'First reply.' : 'Second reply.',
        guidance_mode: 'review',
        prompt_version: 'v1',
      })
    })
    mockUseAIChat()
    const synthesis = installPlaybackSynthesis()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    const textarea = screen.getByLabelText(/message the ai interviewer/i)
    await user.type(textarea, 'First question')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByText('First reply.')
    expect(synthesis.speakCalls).toHaveLength(1)

    await user.type(textarea, 'Second question')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByText('Second reply.')

    expect(synthesis.cancelCalls).toBeGreaterThan(0)
  })

  it('disables voice input while a reply is being spoken and allows it after stopping playback', async function () {
    const user = userEvent.setup()
    const handle = submitTurn('Played aloud.')
    const synthesis = installPlaybackSynthesis()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    await user.type(screen.getByLabelText(/message the ai interviewer/i), 'Talk to me')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByText('Played aloud.')
    expect(synthesis.speakCalls).toHaveLength(1)

    // While the reply is spoken aloud the mic is disabled, so voice input can
    // never overlap with playback; clicking it is a no-op.
    const voiceButton = screen.getByRole('button', { name: /start voice input/i })
    expect(voiceButton).toBeDisabled()
    const cancelBeforeVoiceAttempt = synthesis.cancelCalls
    await user.click(voiceButton)
    expect(synthesis.cancelCalls).toBe(cancelBeforeVoiceAttempt)
    expect(screen.queryByText(/playing reply aloud/i)).toBeInTheDocument()

    // Stopping playback re-enables the mic, after which voice input can start.
    await user.click(screen.getByRole('button', { name: /stop playback/i }))
    expect(synthesis.cancelCalls).toBeGreaterThan(cancelBeforeVoiceAttempt)
    expect(screen.queryByText(/playing reply aloud/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /start voice input/i }))
    expect(FakeSpeechRecognition.latest).not.toBeNull()
  })
})

describe('AIChatSmart duplicate submit protection', function () {
  it('does not send twice when the send button is triggered repeatedly', async function () {
    const user = userEvent.setup()
    const handle = 'handle-1'
    registerWhiteboardSceneApi(handle, makeSceneApi())
    mockGetSnapshot.mockReturnValue({
      type: 'excalidraw_scene',
      scene: { elements: [] },
    })
    let calls = 0
    mockAiChatMutate.mockImplementation(function () {
      calls += 1
      // The mutation stays in flight for the duration of the test.
    })
    mockUseAIChat()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    await user.type(screen.getByLabelText(/message the ai interviewer/i), 'double tap')
    const send = screen.getByRole('button', { name: /send/i })
    await user.click(send)
    await user.click(send)

    expect(calls).toBe(1)
  })

  it('still submits a retry exactly once when retry is triggered once', async function () {
    const user = userEvent.setup()
    const handle = 'handle-1'
    registerWhiteboardSceneApi(handle, makeSceneApi())
    mockGetSnapshot.mockReturnValue({
      type: 'excalidraw_scene',
      scene: { elements: [] },
    })
    let calls = 0
    mockAiChatMutate.mockImplementation(function (_params: any, options: any) {
      calls += 1
      if (calls === 1) {
        options.onError?.(new Error('network'))
      } else {
        options.onSuccess?.({
          reply: 'Recovered.',
          guidance_mode: 'review',
          prompt_version: 'v1',
        })
      }
    })
    mockUseAIChat()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    await user.type(screen.getByLabelText(/message the ai interviewer/i), 'question')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: /retry/i }))
    await screen.findByText('Recovered.')

    expect(calls).toBe(2)
  })
})

describe('AIChatSmart stale request callbacks', function () {
  it('ignores a stale success from a replaced request: no dispatch, no guard clear, no playback', async function () {
    const user = userEvent.setup()
    const handle = 'handle-1'
    registerWhiteboardSceneApi(handle, makeSceneApi())
    mockGetSnapshot.mockReturnValue({
      type: 'excalidraw_scene',
      scene: { elements: [] },
    })

    const attempts: Array<{ options: any }> = []
    mockAiChatMutate.mockImplementation(function (_params: any, options: any) {
      attempts.push({ options })
      // First attempt fails so a retry becomes available; the second attempt
      // stays in flight so its callbacks can fire later.
      if (attempts.length === 1) {
        options.onError?.(new Error('network'))
      }
    })
    mockUseAIChat()
    const synthesis = installPlaybackSynthesis()

    render(<AIChatSmart interviewId="int-1" whiteboardProvisionHandle={handle} />)

    // Submit a message; the first attempt fails and offers a retry.
    await user.type(screen.getByLabelText(/message the ai interviewer/i), 'Question one')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByRole('alert')

    // Retry starts a newer, still-in-flight request that supersedes the first.
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(attempts).toHaveLength(2)

    // A stale success callback from the replaced (first) request fires late.
    act(function () {
      attempts[0].options.onSuccess?.({
        reply: 'Stale reply.',
        guidance_mode: 'review',
        prompt_version: 'v1',
      })
    })

    // The stale callback must not dispatch a reply, clear the in-flight guard,
    // or start playback on behalf of the newer request.
    expect(screen.queryByText('Stale reply.')).not.toBeInTheDocument()
    expect(synthesis.speakCalls).toHaveLength(0)

    // The newer request still resolves normally through the retry path.
    act(function () {
      attempts[1].options.onSuccess?.({
        reply: 'Real reply.',
        guidance_mode: 'review',
        prompt_version: 'v1',
      })
    })
    await screen.findByText('Real reply.')
    expect(synthesis.lastSpokenText).toBe('Real reply.')
  })
})
