import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  createWhiteboardProvisionHandle,
  getWhiteboardProvisionConfig,
  clearWhiteboardProvisionHandle,
  clearAllWhiteboardProvisionHandles,
} from './whiteboard-provision-store'
import type { ProvisionedWhiteboardConfig } from './whiteboard-types'

function makeConfig(overrides?: Partial<ProvisionedWhiteboardConfig>): ProvisionedWhiteboardConfig {
  return {
    mode: 'ai_led',
    realtime: { realtime_session_id: 'rt-test', token: 'token-test' },
    excalidraw: { excalidraw_room_id: 'room-test', excalidraw_key: 'key-test' },
    ...overrides,
  }
}

beforeEach(function () {
  clearAllWhiteboardProvisionHandles()
})

afterEach(function () {
  clearAllWhiteboardProvisionHandles()
})

describe('whiteboard-provision-store', function () {
  it('createWhiteboardProvisionHandle returns a non-empty string handle', function () {
    const handle = createWhiteboardProvisionHandle(makeConfig())
    expect(typeof handle).toBe('string')
    expect(handle.length).toBeGreaterThan(0)
  })

  it('getWhiteboardProvisionConfig returns the stored config for a valid handle', function () {
    const config = makeConfig()
    const handle = createWhiteboardProvisionHandle(config)
    const retrieved = getWhiteboardProvisionConfig(handle)
    expect(retrieved).toEqual(config)
  })

  it('getWhiteboardProvisionConfig returns null for null handle', function () {
    const result = getWhiteboardProvisionConfig(null)
    expect(result).toBeNull()
  })

  it('getWhiteboardProvisionConfig returns null for undefined handle', function () {
    const result = getWhiteboardProvisionConfig(undefined)
    expect(result).toBeNull()
  })

  it('getWhiteboardProvisionConfig returns null for nonexistent handle', function () {
    const result = getWhiteboardProvisionConfig('nonexistent-handle')
    expect(result).toBeNull()
  })

  it('clearWhiteboardProvisionHandle removes the entry', function () {
    const config = makeConfig()
    const handle = createWhiteboardProvisionHandle(config)
    expect(getWhiteboardProvisionConfig(handle)).toEqual(config)

    clearWhiteboardProvisionHandle(handle)
    expect(getWhiteboardProvisionConfig(handle)).toBeNull()
  })

  it('clearWhiteboardProvisionHandle does not throw for null', function () {
    expect(function () {
      clearWhiteboardProvisionHandle(null)
    }).not.toThrow()
  })

  it('clearWhiteboardProvisionHandle does not throw for undefined', function () {
    expect(function () {
      clearWhiteboardProvisionHandle(undefined)
    }).not.toThrow()
  })

  it('clearAllWhiteboardProvisionHandles removes all entries', function () {
    const handle1 = createWhiteboardProvisionHandle(makeConfig({ mode: 'ai_led' }))
    const handle2 = createWhiteboardProvisionHandle(makeConfig({ mode: 'peer_to_peer' }))

    expect(getWhiteboardProvisionConfig(handle1)).not.toBeNull()
    expect(getWhiteboardProvisionConfig(handle2)).not.toBeNull()

    clearAllWhiteboardProvisionHandles()

    expect(getWhiteboardProvisionConfig(handle1)).toBeNull()
    expect(getWhiteboardProvisionConfig(handle2)).toBeNull()
  })

  it('createWhiteboardProvisionHandle returns different handles for multiple calls', function () {
    const handle1 = createWhiteboardProvisionHandle(makeConfig())
    const handle2 = createWhiteboardProvisionHandle(makeConfig())
    expect(handle1).not.toBe(handle2)
  })

  it('multiple handles store entries independently', function () {
    const config1 = makeConfig({ mode: 'ai_led' })
    const config2 = makeConfig({ mode: 'peer_to_peer' })

    const handle1 = createWhiteboardProvisionHandle(config1)
    const handle2 = createWhiteboardProvisionHandle(config2)

    expect(getWhiteboardProvisionConfig(handle1)).toEqual(config1)
    expect(getWhiteboardProvisionConfig(handle2)).toEqual(config2)
  })
})