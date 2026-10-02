export { WhiteboardSmart } from './whiteboard-smart'
export { WhiteboardDumb } from './whiteboard-dumb'
export { mapProvisionToWhiteboardConfig } from './whiteboard-config'
export {
  clearWhiteboardProvisionHandle,
  createWhiteboardProvisionHandle,
  getWhiteboardProvisionConfig,
} from './whiteboard-provision-store'
export {
  clearAllWhiteboardSceneApis,
  getWhiteboardSceneApi,
  getWhiteboardSceneSnapshot,
  registerWhiteboardSceneApi,
  unregisterWhiteboardSceneApi,
} from './whiteboard-scene-store'
export { captureWhiteboardPng } from './whiteboard-capture'
export type {
  ProvisionedWhiteboardConfig,
  WhiteboardCollaborationConfig,
  WhiteboardConnectionStatus,
  WhiteboardProvisionHandle,
  WhiteboardDumbProps,
  WhiteboardRuntimeProps,
  WhiteboardSmartProps,
} from './whiteboard-types'
export type { WhiteboardSceneSnapshot } from './whiteboard-scene-store'
export type { WhiteboardCaptureOutcome } from './whiteboard-capture'
