import { afterEach, describe, expect, it } from 'vitest'
import {
  clearAllWhiteboardSceneApis,
  getWhiteboardSceneApi,
  getWhiteboardSceneSnapshot,
  registerWhiteboardSceneApi,
  unregisterWhiteboardSceneApi,
} from './whiteboard-scene-store'

describe('whiteboard-scene-store', function () {
  afterEach(function () {
    clearAllWhiteboardSceneApis()
  })

  it('returns null when handle is null', function () {
    expect(getWhiteboardSceneSnapshot(null)).toBeNull()
  })

  it('returns null for an unknown handle', function () {
    expect(getWhiteboardSceneSnapshot('missing')).toBeNull()
  })

  it('ignores registration for a null handle', function () {
    registerWhiteboardSceneApi(null, { getSceneElements: function () { return [] } })
    expect(getWhiteboardSceneSnapshot('anything')).toBeNull()
  })

  it('returns null when no api registered despite known handle', function () {
    expect(getWhiteboardSceneSnapshot('known-handle')).toBeNull()
  })

  it('returns an excalidraw_scene snapshot built from scene elements', function () {
    registerWhiteboardSceneApi('handle-1', {
      getSceneElements: function () {
        return [
          { id: 'a', type: 'rectangle', x: 1 },
          { id: 'b', type: 'text', x: 9 },
        ]
      },
    })

    const snapshot = getWhiteboardSceneSnapshot('handle-1')
    expect(snapshot).toEqual({
      type: 'excalidraw_scene',
      scene: {
        elements: [
          { id: 'a', type: 'rectangle', x: 1 },
          { id: 'b', type: 'text', x: 9 },
        ],
      },
    })
  })

  it('unregisters the api for a handle', function () {
    registerWhiteboardSceneApi('handle-1', {
      getSceneElements: function () {
        return [{ id: 'a' }]
      },
    })
    expect(getWhiteboardSceneSnapshot('handle-1')).not.toBeNull()
    unregisterWhiteboardSceneApi('handle-1')
    expect(getWhiteboardSceneSnapshot('handle-1')).toBeNull()
  })

  it('keeps snapshots isolated per handle', function () {
    registerWhiteboardSceneApi('h1', { getSceneElements: function () { return [{ id: 'one' }] } })
    registerWhiteboardSceneApi('h2', { getSceneElements: function () { return [{ id: 'two' }] } })

    expect((getWhiteboardSceneSnapshot('h1') as any)?.scene.elements[0].id).toBe('one')
    expect((getWhiteboardSceneSnapshot('h2') as any)?.scene.elements[0].id).toBe('two')
  })

  describe('getWhiteboardSceneApi', function () {
    it('returns null for a null/unknown handle', function () {
      expect(getWhiteboardSceneApi(null)).toBeNull()
      expect(getWhiteboardSceneApi('missing')).toBeNull()
    })

    it('returns the registered api for a known handle', function () {
      const api = { getSceneElements: function () { return [] } }
      registerWhiteboardSceneApi('handle-1', api)
      expect(getWhiteboardSceneApi('handle-1')).toBe(api)
    })
  })
})
