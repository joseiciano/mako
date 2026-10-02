/**
 * Reads a bounded R2 range-read stream fully into memory and Base64-encodes
 * it for one Workers AI Whisper chunk request. Callers are responsible for
 * keeping the stream bounded (see `chunk-planner.ts`); this never buffers a
 * full recording.
 */
export async function streamToBase64(stream: ReadableStream): Promise<string> {
  const buffer = await new Response(stream).arrayBuffer()
  return arrayBufferToBase64(buffer)
}

/**
 * `Buffer` is available here via the `nodejs_compat` compatibility flag
 * already enabled for the notification-orchestrator Worker, and in Node
 * under test. This avoids a manual `String.fromCharCode(...bytes)` spread,
 * which can overflow the call stack on multi-megabyte chunks.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64')
}
