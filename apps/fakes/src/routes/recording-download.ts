const DOWNLOAD_PATH = /^\/recordings\/[^/]+$/

/** A few bytes labelled as WebM; the stack never plays them back. */
const FAKE_RECORDING_BYTES = new TextEncoder().encode('fake recording bytes for local testing')

/**
 * GET /recordings/:file serves the fake recording the finalization workflow
 * downloads. Needs no authorization, like a signed provider download URL.
 */
export const handleRecordingDownload = (request: Request, path: string): Response | null => {
  if (request.method !== 'GET' || !DOWNLOAD_PATH.test(path)) return null

  return new Response(FAKE_RECORDING_BYTES, {
    headers: {
      'content-type': 'video/webm',
      'content-length': String(FAKE_RECORDING_BYTES.byteLength),
    },
  })
}
