import { getWhiteboardSceneApi } from './whiteboard-scene-store'
import type { WhiteboardProvisionHandle } from './whiteboard-shared-types'

export type WhiteboardCaptureOutcome =
  | { kind: 'empty' }
  | { kind: 'captured'; blob: Blob }

// Bounds the exported image so a single capture stays small and legible
// regardless of how far a participant has panned/zoomed the canvas.
const MAX_CAPTURE_DIMENSION_PX = 1600
const CAPTURE_EXPORT_PADDING_PX = 16
const DEFAULT_CAPTURE_BACKGROUND_COLOR = '#ffffff'

/**
 * Exports the canonical current Excalidraw scene registered for `handle` to a
 * bounded PNG Blob using Excalidraw's own `exportToBlob` export pipeline.
 *
 * `exportToBlob` renders only the committed scene graph (elements + files),
 * never the interactive canvas layer, so the result never contains live
 * collaborator cursors, selection outlines, or transient tool UI chrome.
 *
 * Returns an explicit `{ kind: 'empty' }` result when the scene has no
 * elements, so callers can skip uploading a meaningless blank image instead
 * of treating an empty scene as a capture failure.
 *
 * Throws when no whiteboard scene is registered for `handle` (e.g. the
 * whiteboard never connected), which callers should treat as a capture
 * failure distinct from a legitimately empty scene.
 */
export async function captureWhiteboardPng(
  handle: WhiteboardProvisionHandle | null | undefined,
): Promise<WhiteboardCaptureOutcome> {
  const api = getWhiteboardSceneApi(handle)

  if (!api) {
    throw new Error('Whiteboard scene is not available for capture.')
  }

  const elements = api.getSceneElements()

  if (elements.length === 0) {
    return { kind: 'empty' }
  }

  const { exportToBlob } = await import('@excalidraw/excalidraw')
  const appState = api.getAppState?.() ?? {}
  const files = api.getFiles?.() ?? {}
  const viewBackgroundColor =
    typeof appState.viewBackgroundColor === 'string'
      ? appState.viewBackgroundColor
      : DEFAULT_CAPTURE_BACKGROUND_COLOR

  const blob = await exportToBlob({
    // Structural cast: `elements`/`files` come from our minimal
    // `WhiteboardSceneApi` contract rather than Excalidraw's own imperative
    // API types (see whiteboard-scene-store.ts for why).
    elements: elements as never,
    appState: {
      viewBackgroundColor,
      exportBackground: true,
      exportWithDarkMode: false,
    },
    exportPadding: CAPTURE_EXPORT_PADDING_PX,
    files: files as never,
    maxWidthOrHeight: MAX_CAPTURE_DIMENSION_PX,
    mimeType: 'image/png',
  })

  return { kind: 'captured', blob }
}
