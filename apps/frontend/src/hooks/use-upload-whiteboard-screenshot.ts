import {
  screenshotUploadResponseSchema,
  type ScreenshotUploadResponse,
} from '@mako/shared'
import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import {
  ApiError,
  createApiRequestInit,
  createApiUrl,
  demoSessionHeaders,
  parseResponse,
  readErrorMessage,
} from '../lib/http-transport'

export type UploadWhiteboardScreenshotParams = {
  id: string
  idempotencyKey: string
  captureTimestamp: string
  blob: Blob
}

/**
 * Uploads one bounded whiteboard capture for an ongoing interview.
 *
 * The backend route (`POST /api/interviews/:id/artifacts/screenshots`)
 * accepts a raw `image/png` body alongside `X-Idempotency-Key` and
 * `X-Capture-Timestamp` headers, and deduplicates retried uploads by
 * `idempotencyKey`. Callers should reuse the same `idempotencyKey` across
 * retries of the same logical capture so a retried request resolves to the
 * original stored capture instead of creating a duplicate artifact.
 */
export async function uploadWhiteboardScreenshot(
  params: UploadWhiteboardScreenshotParams,
  fetchImpl: typeof fetch = fetch,
): Promise<ScreenshotUploadResponse> {
  const response = await fetchImpl(
    createApiUrl(`/api/interviews/${params.id}/artifacts/screenshots`),
    createApiRequestInit({
      method: 'POST',
      headers: {
        'content-type': 'image/png',
        'x-idempotency-key': params.idempotencyKey,
        'x-capture-timestamp': params.captureTimestamp,
        ...demoSessionHeaders,
      },
      body: params.blob,
    }),
  )

  const payload = await parseResponse(response)

  if (!response.ok) {
    throw new ApiError(
      readErrorMessage(payload, 'Unable to upload whiteboard capture.'),
      response.status,
    )
  }

  return screenshotUploadResponseSchema.parse(payload)
}

export function useUploadWhiteboardScreenshot(): UseMutationResult<
  ScreenshotUploadResponse,
  Error,
  UploadWhiteboardScreenshotParams
> {
  return useMutation({
    mutationFn: function uploadWhiteboardScreenshotMutation(params) {
      return uploadWhiteboardScreenshot(params)
    },
    // A single automatic retry reuses the same `idempotencyKey`/variables,
    // so a transient network failure cannot upload a duplicate capture.
    retry: 1,
  })
}
