import type { AiChatRequest } from '@mako/shared'
import type { WhiteboardProvisionHandle } from './whiteboard-shared-types'

export type WhiteboardSceneSnapshot = AiChatRequest['canvas_snapshot']

/**
 * Minimal structural contract for the Excalidraw imperative API surface we
 * consume. We intentionally avoid importing `ExcalidrawImperativeAPI` from
 * `@excalidraw/excalidraw` because it is not re-exported from the package root.
 */
export type WhiteboardSceneApi = {
  getSceneElements: () => readonly unknown[]
}

const excalidrawApiStore = new Map<WhiteboardProvisionHandle, WhiteboardSceneApi>()

export function registerWhiteboardSceneApi(
  handle: WhiteboardProvisionHandle | null | undefined,
  api: WhiteboardSceneApi,
): void {
  if (!handle) return
  excalidrawApiStore.set(handle, api)
}

export function unregisterWhiteboardSceneApi(
  handle: WhiteboardProvisionHandle | null | undefined,
): void {
  if (!handle) return
  excalidrawApiStore.delete(handle)
}

export function clearAllWhiteboardSceneApis(): void {
  excalidrawApiStore.clear()
}

export function getWhiteboardSceneSnapshot(
  handle: WhiteboardProvisionHandle | null | undefined,
): WhiteboardSceneSnapshot | null {
  if (!handle) return null
  const api = excalidrawApiStore.get(handle)
  if (!api) return null

  const elements = api.getSceneElements()

  return {
    type: 'excalidraw_scene',
    scene: {
      elements: JSON.parse(JSON.stringify(elements)) as Record<string, unknown>,
    },
  } as WhiteboardSceneSnapshot
}
