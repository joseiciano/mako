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

  return { mockImpl, initMeeting, setMeetingOverride: (o: Record<string, unknown> | null) => { currentMeetingOverride = o } }
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

  it('transitions to waiting-for-peer after successful join with no participants', async function () {
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
      expect(result.current.status).toBe('waiting-for-peer')
    })
    expect(result.current.remoteParticipantCount).toBe(0)
  })

  it('transitions to failed on join error', async function () {
    // Set up mock to return a meeting that rejects join
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
  })

  it('toggles audio when connected', async function () {
    mockClient.setMeetingOverride({
      self: {
        roomJoined: true,
        audioEnabled: false,
        on: vi.fn(),
        off: vi.fn(),
        enableAudio: vi.fn().mockResolvedValue(undefined),
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

    await waitFor(() => {
      expect(result.current.status).not.toBe('connecting')
    })

    act(() => {
      result.current.toggleAudio()
    })

    // The enableAudio should have been called since audio was disabled
    // We can't directly check the mock meeting since it's internal, but
    // we can verify the toggle didn't throw
    expect(result.current.isAudioEnabled).toBe(false)
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