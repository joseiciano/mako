import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { useMediaConnection } from './use-media-connection'

// Mock the RealtimeKit React SDK
vi.mock('@cloudflare/realtimekit-react', () => ({
  useRealtimeKitClient: vi.fn(),
}))

import { useRealtimeKitClient } from '@cloudflare/realtimekit-react'

function createMockMeeting(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const eventHandlers: Record<string, Function> = {}

  const self = {
    audioEnabled: false,
    videoEnabled: false,
    roomJoined: false,
    on: vi.fn((event: string, handler: Function) => {
      eventHandlers[`self:${event}`] = handler
    }),
    off: vi.fn(),
    enableAudio: vi.fn().mockResolvedValue(undefined),
    disableAudio: vi.fn().mockResolvedValue(undefined),
    enableVideo: vi.fn().mockResolvedValue(undefined),
    disableVideo: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }

  const participants = {
    joined: {
      size: 0,
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers[`participants:${event}`] = handler
      }),
      off: vi.fn(),
    },
    active: { size: 0 },
  }

  const meta = {
    on: vi.fn((event: string, handler: Function) => {
      eventHandlers[`meta:${event}`] = handler
    }),
    off: vi.fn(),
    mediaConnectionState: 'new',
  }

  return {
    self,
    participants,
    meta,
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    _eventHandlers: eventHandlers,
    ...overrides,
  }
}

/**
 * Creates a stateful mock of useRealtimeKitClient that simulates
 * the meeting object becoming available after initMeeting is called.
 */
function createStatefulMockClient(initialMeeting: Record<string, unknown> | null = null) {
  let currentMeeting = initialMeeting
  let currentMeetingOverride: Record<string, unknown> | null = null

  const initMeeting = vi.fn((_config: Record<string, unknown>) => {
    currentMeeting = createMockMeeting(currentMeetingOverride || {})
    // Trigger re-render by updating state
    setMeeting(currentMeeting)
  })

  let setMeeting: (m: Record<string, unknown> | null) => void = () => {}

  const mockImpl = () => {
    const [meeting, setM] = useState(currentMeeting)
    setMeeting = setM
    return [meeting, initMeeting] as const
  }

  return {
    mockImpl,
    initMeeting,
    getCurrentMeeting: () => currentMeeting,
    setMeetingOverride: (o: Record<string, unknown> | null) => { currentMeetingOverride = o },
  }
}

describe('useMediaConnection', function () {
  let mockClient: ReturnType<typeof createStatefulMockClient>

  beforeEach(function () {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockClient = createStatefulMockClient()
    vi.mocked(useRealtimeKitClient).mockImplementation(mockClient.mockImpl as any)
  })

  afterEach(function () {
    vi.useRealTimers()
  })

  it('starts in pre-join state', function () {
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    expect(result.current.status).toBe('pre-join')
    expect(result.current.isAudioEnabled).toBe(false)
    expect(result.current.isVideoEnabled).toBe(false)
    expect(result.current.remoteParticipantCount).toBe(0)
  })

  it('transitions to connecting on connect', function () {
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    expect(result.current.status).toBe('connecting')
    expect(mockClient.initMeeting).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: 'token-1',
        roomName: 'rt-1',
      }),
    )
  })

  it('does not allow duplicate connect attempts', function () {
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
      result.current.connect()
    })

    expect(mockClient.initMeeting).toHaveBeenCalledTimes(1)
  })

  it('waits for roomJoined event before transitioning after successful join', async function () {
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.status).toBe('connecting')

    const meeting = mockClient.getCurrentMeeting()
    expect(meeting).toBeTruthy()

    act(() => {
      const handlers = (meeting?._eventHandlers ?? {}) as Record<string, Function>
      handlers['self:roomJoined']?.()
    })

    await waitFor(() => {
      expect(result.current.status).toBe('waiting-for-peer')
    })
    expect(result.current.remoteParticipantCount).toBe(0)
  })

  it('syncs audio and video state from the meeting when room joins', async function () {
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    const meeting = mockClient.getCurrentMeeting()
    const self = meeting?.self as { audioEnabled: boolean; videoEnabled: boolean } | undefined
    expect(self).toBeDefined()

    self!.audioEnabled = true
    self!.videoEnabled = true

    act(() => {
      const handlers = (meeting?._eventHandlers ?? {}) as Record<string, Function>
      handlers['self:roomJoined']?.()
    })

    await waitFor(() => {
      expect(result.current.isAudioEnabled).toBe(true)
      expect(result.current.isVideoEnabled).toBe(true)
    })
  })

  it('treats unexpected room leaves as failed connections', async function () {
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    const meeting = mockClient.getCurrentMeeting()
    act(() => {
      const handlers = (meeting?._eventHandlers ?? {}) as Record<string, Function>
      handlers['self:roomJoined']?.()
    })

    await waitFor(() => {
      expect(result.current.status).toBe('waiting-for-peer')
    })

    act(() => {
      const handlers = (meeting?._eventHandlers ?? {}) as Record<string, Function>
      handlers['self:roomLeft']?.()
    })

    expect(result.current.status).toBe('failed')
    expect(result.current.remoteParticipantCount).toBe(0)
  })

  it('transitions to failed on join error', async function () {
    // Set up mock to return a meeting that rejects join
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.setMeetingOverride({
      join: vi.fn().mockRejectedValue(new Error('Join failed')),
    })

    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.status).toBe('failed')
    })
    consoleError.mockRestore()
  })

  it('logs join errors when meeting join rejects', async function () {
    const joinError = new Error('Join failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.setMeetingOverride({
      join: vi.fn().mockRejectedValue(joinError),
    })

    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.status).toBe('failed')
    })
    expect(consoleError).toHaveBeenCalledWith('Meeting join failed:', joinError)
    consoleError.mockRestore()
  })

  it('keeps timeout protection after meeting is initialized', async function () {
    mockClient.setMeetingOverride({
      join: vi.fn(() => new Promise(() => {})),
    })

    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      vi.advanceTimersByTime(30000)
    })

    expect(result.current.status).toBe('failed')
  })

  it('toggles audio when connected', async function () {
    const enableAudio = vi.fn().mockResolvedValue(undefined)
    mockClient.setMeetingOverride({
      self: {
        roomJoined: true,
        audioEnabled: false,
        on: vi.fn(),
        off: vi.fn(),
        enableAudio,
        disableAudio: vi.fn().mockResolvedValue(undefined),
      },
    })

    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.toggleAudio()
    })

    expect(enableAudio).toHaveBeenCalledOnce()
  })

  it('uses generic failure for audio enable failures', async function () {
    const enableError = new Error('Network failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.setMeetingOverride({
      self: {
        roomJoined: true,
        audioEnabled: false,
        videoEnabled: false,
        on: vi.fn(),
        off: vi.fn(),
        enableAudio: vi.fn().mockRejectedValue(enableError),
        disableAudio: vi.fn().mockResolvedValue(undefined),
        enableVideo: vi.fn().mockResolvedValue(undefined),
        disableVideo: vi.fn().mockResolvedValue(undefined),
      },
    })

    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.toggleAudio()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.status).toBe('failed')
    expect(result.current.permissionError).toBeNull()
    expect(consoleError).toHaveBeenCalledWith('Failed to enable audio:', enableError)
    consoleError.mockRestore()
  })

  it('surfaces permission denied errors from audio enable failures', async function () {
    const enableError = { code: '1602', message: 'Permission denied' }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.setMeetingOverride({
      self: {
        roomJoined: true,
        audioEnabled: false,
        videoEnabled: false,
        on: vi.fn(),
        off: vi.fn(),
        enableAudio: vi.fn().mockRejectedValue(enableError),
        disableAudio: vi.fn().mockResolvedValue(undefined),
        enableVideo: vi.fn().mockResolvedValue(undefined),
        disableVideo: vi.fn().mockResolvedValue(undefined),
      },
    })

    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.toggleAudio()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.status).toBe('failed')
    expect(result.current.permissionError).toBe('denied')
    consoleError.mockRestore()
  })

  it('uses generic failure for video enable failures', async function () {
    const enableError = new Error('Network failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.setMeetingOverride({
      self: {
        roomJoined: true,
        audioEnabled: false,
        videoEnabled: false,
        on: vi.fn(),
        off: vi.fn(),
        enableAudio: vi.fn().mockResolvedValue(undefined),
        disableAudio: vi.fn().mockResolvedValue(undefined),
        enableVideo: vi.fn().mockRejectedValue(enableError),
        disableVideo: vi.fn().mockResolvedValue(undefined),
      },
    })

    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.toggleVideo()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.status).toBe('failed')
    expect(result.current.permissionError).toBeNull()
    expect(consoleError).toHaveBeenCalledWith('Failed to enable video:', enableError)
    consoleError.mockRestore()
  })

  it('surfaces device unavailable errors from video enable failures', async function () {
    const enableError = { code: '1603', message: 'No device found' }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.setMeetingOverride({
      self: {
        roomJoined: true,
        audioEnabled: false,
        videoEnabled: false,
        on: vi.fn(),
        off: vi.fn(),
        enableAudio: vi.fn().mockResolvedValue(undefined),
        disableAudio: vi.fn().mockResolvedValue(undefined),
        enableVideo: vi.fn().mockRejectedValue(enableError),
        disableVideo: vi.fn().mockResolvedValue(undefined),
      },
    })

    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.toggleVideo()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.status).toBe('failed')
    expect(result.current.permissionError).toBe('device-unavailable')
    consoleError.mockRestore()
  })

  it('logs disable audio failures', async function () {
    const disableError = new Error('Disable audio failed')
    const disableAudio = vi.fn().mockRejectedValue(disableError)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.setMeetingOverride({
      self: {
        roomJoined: true,
        audioEnabled: true,
        videoEnabled: false,
        on: vi.fn(),
        off: vi.fn(),
        enableAudio: vi.fn().mockResolvedValue(undefined),
        disableAudio,
        enableVideo: vi.fn().mockResolvedValue(undefined),
        disableVideo: vi.fn().mockResolvedValue(undefined),
      },
    })

    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.toggleAudio()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(disableAudio).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledWith('Failed to disable audio:', disableError)
    consoleError.mockRestore()
  })

  it('logs disable video failures', async function () {
    const disableError = new Error('Disable video failed')
    const disableVideo = vi.fn().mockRejectedValue(disableError)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.setMeetingOverride({
      self: {
        roomJoined: true,
        audioEnabled: false,
        videoEnabled: true,
        on: vi.fn(),
        off: vi.fn(),
        enableAudio: vi.fn().mockResolvedValue(undefined),
        disableAudio: vi.fn().mockResolvedValue(undefined),
        enableVideo: vi.fn().mockResolvedValue(undefined),
        disableVideo,
      },
    })

    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.toggleVideo()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(disableVideo).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledWith('Failed to disable video:', disableError)
    consoleError.mockRestore()
  })

  it('syncs audio and video state from SDK update events', async function () {
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    const meeting = mockClient.getCurrentMeeting()
    act(() => {
      const handlers = (meeting?._eventHandlers ?? {}) as Record<string, Function>
      handlers['self:audioUpdate']?.({ audioEnabled: true })
      handlers['self:videoUpdate']?.({ videoEnabled: true })
    })

    expect(result.current.isAudioEnabled).toBe(true)
    expect(result.current.isVideoEnabled).toBe(true)
  })

  it('uses the SDK video update track for local video state', async function () {
    const videoTrack = { id: 'local-video-track' } as MediaStreamTrack

    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    const meeting = mockClient.getCurrentMeeting()
    act(() => {
      const handlers = (meeting?._eventHandlers ?? {}) as Record<string, Function>
      handlers['self:videoUpdate']?.({ videoEnabled: true, videoTrack })
    })

    expect(result.current.isVideoEnabled).toBe(true)
    expect(result.current.localVideoTrack).toBe(videoTrack)
  })

  it('refreshes remote video when a joined peer enables video later', async function () {
    const videoTrack = { id: 'remote-video-track' } as MediaStreamTrack
    const participant = { videoEnabled: false, videoTrack: null as MediaStreamTrack | null }

    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    const meeting = mockClient.getCurrentMeeting()
    const joined = (meeting?.participants as { joined: {
      size: number
      values: () => Iterable<typeof participant>
    } }).joined
    joined.size = 1
    joined.values = () => [participant].values()

    act(() => {
      const handlers = (meeting?._eventHandlers ?? {}) as Record<string, Function>
      handlers['self:roomJoined']?.()
    })

    await waitFor(() => {
      expect(result.current.remoteParticipantCount).toBe(1)
    })
    expect(result.current.remoteVideoTrack).toBeNull()

    act(() => {
      participant.videoEnabled = true
      participant.videoTrack = videoTrack
      const handlers = (meeting?._eventHandlers ?? {}) as Record<string, Function>
      handlers['participants:videoUpdate']?.(participant, {
        videoEnabled: true,
        videoTrack,
      })
    })

    expect(result.current.remoteVideoTrack).toBe(videoTrack)
  })

  it('leaves the meeting before showing failed state when enabling audio fails', async function () {
    const enableError = new Error('Enable audio failed')
    const leave = vi.fn().mockResolvedValue(undefined)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.setMeetingOverride({
      leave,
      self: {
        roomJoined: true,
        audioEnabled: false,
        videoEnabled: true,
        on: vi.fn(),
        off: vi.fn(),
        enableAudio: vi.fn().mockRejectedValue(enableError),
        disableAudio: vi.fn().mockResolvedValue(undefined),
        enableVideo: vi.fn().mockResolvedValue(undefined),
        disableVideo: vi.fn().mockResolvedValue(undefined),
      },
    })

    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.toggleAudio()
    })

    await waitFor(() => {
      expect(leave).toHaveBeenCalledOnce()
      expect(result.current.status).toBe('failed')
    })

    consoleError.mockRestore()
  })

  it('waits for leave to finish before reconnecting', async function () {
    let resolveLeave: () => void = () => {}
    const leave = vi.fn(() =>
      new Promise<void>((resolve) => {
        resolveLeave = resolve
      }),
    )
    mockClient.setMeetingOverride({ leave })

    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockClient.initMeeting).toHaveBeenCalledTimes(1)

    act(() => {
      void result.current.reconnect()
    })

    expect(leave).toHaveBeenCalledOnce()
    expect(mockClient.initMeeting).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveLeave()
      await Promise.resolve()
    })

    expect(mockClient.initMeeting).toHaveBeenCalledTimes(2)
  })

  it('does not toggle audio when not connected', function () {
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.toggleAudio()
    })

    // Should not throw and should stay in pre-join
    expect(result.current.status).toBe('pre-join')
  })

  it('disconnects and resets state', async function () {
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.disconnect()
    })

    expect(result.current.status).toBe('pre-join')
    expect(result.current.remoteParticipantCount).toBe(0)
  })

  it('logs leave failures during disconnect', async function () {
    const leaveError = new Error('Leave failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockClient.setMeetingOverride({
      leave: vi.fn().mockRejectedValue(leaveError),
    })

    const { result, unmount } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.disconnect()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(consoleError).toHaveBeenCalledWith('Failed to leave meeting:', leaveError)
    unmount()

    await act(async () => {
      await Promise.resolve()
    })
    consoleError.mockRestore()
  })

  it('reconnects immediately without a delayed timer', function () {
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.reconnect()
    })

    expect(mockClient.initMeeting).toHaveBeenCalledTimes(1)
  })

  it('handles permission denied error', function () {
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    const initCall = mockClient.initMeeting.mock.calls[0]?.[0] as { onError: (error: { code: string; message: string }) => void } | undefined
    expect(initCall).toBeDefined()

    act(() => {
      initCall!.onError({ code: '1602', message: 'Permission denied' })
    })

    expect(result.current.status).toBe('failed')
    expect(result.current.permissionError).toBe('denied')
  })

  it('handles device unavailable error', function () {
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    const initCall = mockClient.initMeeting.mock.calls[0]?.[0] as { onError: (error: { code: string; message: string }) => void } | undefined
    expect(initCall).toBeDefined()

    act(() => {
      initCall!.onError({ code: '1603', message: 'No device found' })
    })

    expect(result.current.status).toBe('failed')
    expect(result.current.permissionError).toBe('device-unavailable')
  })

  it('fails fast on unrecognized SDK errors', function () {
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    const initCall = mockClient.initMeeting.mock.calls[0]?.[0] as { onError: (error: { code: string; message: string }) => void } | undefined
    expect(initCall).toBeDefined()

    act(() => {
      initCall!.onError({ code: '5000', message: 'Server error' })
    })

    expect(result.current.status).toBe('failed')
    expect(result.current.permissionError).toBeNull()
  })

  it('does not connect when config is null', function () {
    const { result } = renderHook(() => useMediaConnection(null))

    act(() => {
      result.current.connect()
    })

    expect(mockClient.initMeeting).not.toHaveBeenCalled()
    expect(result.current.status).toBe('pre-join')
  })

  it('prevents duplicate in-flight connect attempts', function () {
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'token-1' }),
    )

    act(() => {
      result.current.connect()
    })

    const firstCallCount = mockClient.initMeeting.mock.calls.length

    act(() => {
      result.current.connect()
    })

    expect(mockClient.initMeeting.mock.calls.length).toBe(firstCallCount)
  })

  it('does not log sensitive token values', function () {
    const consoleSpy = vi.spyOn(console, 'log')
    const { result } = renderHook(() =>
      useMediaConnection({ realtimeSessionId: 'rt-1', token: 'secret-token-123' }),
    )

    act(() => {
      result.current.connect()
    })

    // Check that no console.log contains the token
    const allLogs = consoleSpy.mock.calls.flat().join(' ')
    expect(allLogs).not.toContain('secret-token-123')

    consoleSpy.mockRestore()
  })
})
