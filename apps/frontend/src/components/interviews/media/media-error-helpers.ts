import type { MediaPermissionError } from './media-types'

export function getErrorMessage(error: MediaPermissionError | null): string {
  switch (error) {
    case 'denied':
      return 'Camera or microphone access was denied'
    case 'device-unavailable':
      return 'Camera or microphone is not available'
    default:
      return 'Media connection failed'
  }
}

export function getErrorGuidance(error: MediaPermissionError | null): string {
  switch (error) {
    case 'denied':
      return 'Please allow camera and microphone access in your browser settings, then try again.'
    case 'device-unavailable':
      return 'Make sure your camera and microphone are connected and not being used by another application.'
    default:
      return 'Please check your internet connection and try again.'
  }
}
