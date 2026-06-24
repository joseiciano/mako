import type {
  ProvisionedWhiteboardConfig,
  WhiteboardCollaborationConfig,
} from './whiteboard-types'

export function mapProvisionToWhiteboardConfig(
  provisionedWhiteboard: ProvisionedWhiteboardConfig | null | undefined,
): WhiteboardCollaborationConfig | null {
  const roomId = provisionedWhiteboard?.excalidraw?.excalidraw_room_id?.trim()
  const roomKey = provisionedWhiteboard?.excalidraw?.excalidraw_key?.trim()
  const realtimeSessionId = provisionedWhiteboard?.realtime?.realtime_session_id?.trim()
  const realtimeToken = provisionedWhiteboard?.realtime?.token?.trim()

  if (!provisionedWhiteboard?.mode || !roomId || !roomKey || !realtimeSessionId || !realtimeToken) {
    return null
  }

  return {
    mode: provisionedWhiteboard.mode,
    realtimeSessionId,
    realtimeToken,
    roomId,
    roomKey,
    collaborationEnabled: true,
  }
}
