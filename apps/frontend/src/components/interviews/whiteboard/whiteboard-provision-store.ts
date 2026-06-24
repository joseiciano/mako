import type { ProvisionedWhiteboardConfig, WhiteboardProvisionHandle } from './whiteboard-types'

const provisionStore = new Map<WhiteboardProvisionHandle, ProvisionedWhiteboardConfig>()

export function createWhiteboardProvisionHandle(
  provisionedWhiteboard: ProvisionedWhiteboardConfig,
): WhiteboardProvisionHandle {
  const handle = createHandleId()
  provisionStore.set(handle, provisionedWhiteboard)
  return handle
}

export function getWhiteboardProvisionConfig(
  handle: WhiteboardProvisionHandle | null | undefined,
): ProvisionedWhiteboardConfig | null {
  if (!handle) return null
  return provisionStore.get(handle) ?? null
}

export function clearWhiteboardProvisionHandle(
  handle: WhiteboardProvisionHandle | null | undefined,
) {
  if (!handle) return
  provisionStore.delete(handle)
}

export function clearAllWhiteboardProvisionHandles() {
  provisionStore.clear()
}

function createHandleId(): WhiteboardProvisionHandle {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const array = new Uint32Array(2)
    crypto.getRandomValues(array)
    return `whiteboard-provision-${Date.now()}-${array[0].toString(36)}${array[1].toString(36)}`
  }

  return `whiteboard-provision-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

