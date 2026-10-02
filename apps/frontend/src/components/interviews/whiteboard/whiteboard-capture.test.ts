import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureWhiteboardPng } from './whiteboard-capture'
import {
  clearAllWhiteboardSceneApis,
  registerWhiteboardSceneApi,
} from './whiteboard-scene-store'

const mockExportToBlob = vi.fn()

vi.mock('@excalidraw/excalidraw', function () {
  return {
    exportToBlob: (...args: unknown[]) => mockExportToBlob(...args),
  }
})

describe('captureWhiteboardPng', function () {
  afterEach(function () {
    clearAllWhiteboardSceneApis()
    mockExportToBlob.mockReset()
  })

  it('throws when no scene is registered for the handle', async function () {
    await expect(captureWhiteboardPng('missing-handle')).rejects.toThrow(
      'Whiteboard scene is not available for capture.',
    )
    expect(mockExportToBlob).not.toHaveBeenCalled()
  })

  it('throws for a null/undefined handle', async function () {
    await expect(captureWhiteboardPng(null)).rejects.toThrow()
    await expect(captureWhiteboardPng(undefined)).rejects.toThrow()
    expect(mockExportToBlob).not.toHaveBeenCalled()
  })

  it('returns an empty-scene result without exporting when there are no elements', async function () {
    registerWhiteboardSceneApi('handle-empty', {
      getSceneElements: function () {
        return []
      },
    })

    const result = await captureWhiteboardPng('handle-empty')

    expect(result).toEqual({ kind: 'empty' })
    expect(mockExportToBlob).not.toHaveBeenCalled()
  })

  it('exports a populated scene to a bounded PNG blob', async function () {
    const fakeBlob = new Blob(['fake-png-bytes'], { type: 'image/png' })
    mockExportToBlob.mockResolvedValue(fakeBlob)

    registerWhiteboardSceneApi('handle-populated', {
      getSceneElements: function () {
        return [{ id: 'a', type: 'rectangle' }]
      },
      getAppState: function () {
        return { viewBackgroundColor: '#123456' }
      },
      getFiles: function () {
        return { 'file-1': { id: 'file-1' } }
      },
    })

    const result = await captureWhiteboardPng('handle-populated')

    expect(result).toEqual({ kind: 'captured', blob: fakeBlob })
    expect(mockExportToBlob).toHaveBeenCalledTimes(1)
    const exportArgs = mockExportToBlob.mock.calls[0][0]
    expect(exportArgs.elements).toEqual([{ id: 'a', type: 'rectangle' }])
    expect(exportArgs.files).toEqual({ 'file-1': { id: 'file-1' } })
    expect(exportArgs.mimeType).toBe('image/png')
    expect(exportArgs.appState).toEqual(
      expect.objectContaining({
        viewBackgroundColor: '#123456',
        exportBackground: true,
        exportWithDarkMode: false,
      }),
    )
    expect(exportArgs.maxWidthOrHeight).toBeGreaterThan(0)
  })

  it('falls back to a default background and empty files when getAppState/getFiles are missing', async function () {
    const fakeBlob = new Blob(['fake-png-bytes'], { type: 'image/png' })
    mockExportToBlob.mockResolvedValue(fakeBlob)

    registerWhiteboardSceneApi('handle-minimal', {
      getSceneElements: function () {
        return [{ id: 'a' }]
      },
    })

    const result = await captureWhiteboardPng('handle-minimal')

    expect(result).toEqual({ kind: 'captured', blob: fakeBlob })
    const exportArgs = mockExportToBlob.mock.calls[0][0]
    expect(exportArgs.appState.viewBackgroundColor).toBe('#ffffff')
    expect(exportArgs.files).toEqual({})
  })

  it('propagates export failures as rejections', async function () {
    mockExportToBlob.mockRejectedValue(new Error('canvas export failed'))

    registerWhiteboardSceneApi('handle-failing', {
      getSceneElements: function () {
        return [{ id: 'a' }]
      },
    })

    await expect(captureWhiteboardPng('handle-failing')).rejects.toThrow('canvas export failed')
  })
})
