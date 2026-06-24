import { describe, expect, it } from 'vitest'
import { mapProvisionToWhiteboardConfig } from './whiteboard-config'
import type { ProvisionedWhiteboardConfig } from './whiteboard-types'

function makeProvision(
  overrides?: Partial<ProvisionedWhiteboardConfig>,
): ProvisionedWhiteboardConfig {
  return {
    mode: 'ai_led',
    realtime: {
      realtime_session_id: 'rt-1',
      token: 'token-1',
    },
    excalidraw: {
      excalidraw_room_id: 'room-1',
      excalidraw_key: 'key-1',
    },
    ...overrides,
  }
}

describe('mapProvisionToWhiteboardConfig', function () {
  it('maps provision response to collaboration config', function () {
    const config = mapProvisionToWhiteboardConfig(makeProvision())
    expect(config).toEqual({
      mode: 'ai_led',
      realtimeSessionId: 'rt-1',
      realtimeToken: 'token-1',
      roomId: 'room-1',
      roomKey: 'key-1',
      collaborationEnabled: true,
    })
  })

  it('returns null when provision is null', function () {
    const config = mapProvisionToWhiteboardConfig(null)
    expect(config).toBeNull()
  })

  it('returns null when provision is undefined', function () {
    const config = mapProvisionToWhiteboardConfig(undefined)
    expect(config).toBeNull()
  })

  it('returns null when room id is empty', function () {
    const config = mapProvisionToWhiteboardConfig(
      makeProvision({
        excalidraw: { excalidraw_room_id: '', excalidraw_key: 'key-1' },
      }),
    )
    expect(config).toBeNull()
  })

  it('returns null when room key is empty', function () {
    const config = mapProvisionToWhiteboardConfig(
      makeProvision({
        excalidraw: { excalidraw_room_id: 'room-1', excalidraw_key: '' },
      }),
    )
    expect(config).toBeNull()
  })

  it('trims whitespace from room id and key', function () {
    const config = mapProvisionToWhiteboardConfig(
      makeProvision({
        excalidraw: {
          excalidraw_room_id: '  room-abc  ',
          excalidraw_key: '  key-xyz  ',
        },
      }),
    )
    expect(config?.roomId).toBe('room-abc')
    expect(config?.roomKey).toBe('key-xyz')
  })
})
