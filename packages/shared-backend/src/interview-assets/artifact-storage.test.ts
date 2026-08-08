import type { R2Bucket } from '@cloudflare/workers-types'
import { describe, expect, it, vi } from 'vitest'
import {
  createArtifactStorage,
  createR2BucketPort,
} from './artifact-storage'
import {
  buildRecordingKey,
  buildScreenshotKey,
  DEFAULT_ARTIFACT_STORAGE_CONFIG,
  type ArtifactStoragePort,
  type R2BucketPort,
} from './types'

const sampleBody = new Uint8Array([1, 2, 3, 4]).buffer as ArrayBuffer
const captureTimestamp = '2026-08-07T12:00:00.000Z'
const interviewId = '11111111-1111-4111-8111-111111111111'
const recordingId = '22222222-2222-4222-8222-222222222222'
const screenshotId = '33333333-3333-4333-8333-333333333333'

function createMockBucket(): R2BucketPort {
  return {
    put: vi.fn(async () => undefined),
    head: vi.fn<R2BucketPort['head']>(async () => null),
    get: vi.fn<R2BucketPort['get']>(async () => null),
    delete: vi.fn(async () => undefined),
  }
}

function createStorage(
  recordingsBucket: R2BucketPort = createMockBucket(),
  screenshotsBucket: R2BucketPort = createMockBucket(),
): { storage: ArtifactStoragePort; recordingsBucket: R2BucketPort; screenshotsBucket: R2BucketPort } {
  return {
    storage: createArtifactStorage(recordingsBucket, screenshotsBucket),
    recordingsBucket,
    screenshotsBucket,
  }
}

describe('buildRecordingKey', function keySuite() {
  it('produces interviews/{id}/recording/{id}', function run() {
    expect(buildRecordingKey(interviewId, recordingId)).toBe(
      `interviews/${interviewId}/recording/${recordingId}`,
    )
  })
})

describe('buildScreenshotKey', function keySuite() {
  it('produces interviews/{id}/screenshots/{id}', function run() {
    expect(buildScreenshotKey(interviewId, screenshotId)).toBe(
      `interviews/${interviewId}/screenshots/${screenshotId}`,
    )
  })
})

describe('storeRecording', function storeRecordingSuite() {
  it('stores with correct key and metadata', async function run() {
    const { storage, recordingsBucket } = createStorage()

    const result = await storage.storeRecording({
      interviewId,
      recordingId,
      contentType: 'video/webm',
      body: sampleBody,
      captureTimestamp,
    })

    const expectedKey = buildRecordingKey(interviewId, recordingId)
    expect(recordingsBucket.put).toHaveBeenCalledExactlyOnceWith({
      key: expectedKey,
      body: sampleBody,
      contentType: 'video/webm',
      metadata: {
        interviewId,
        artifactKind: 'playback_recording',
        contentType: 'video/webm',
        captureTimestamp,
      },
    })
    expect(result.key).toBe(expectedKey)
    expect(result.metadata).toEqual({
      interviewId,
      artifactKind: 'playback_recording',
      contentType: 'video/webm',
      captureTimestamp,
    })
  })

  it('rejects invalid content types', async function run() {
    const { storage, recordingsBucket } = createStorage()

    await expect(
      storage.storeRecording({
        interviewId,
        recordingId,
        contentType: 'application/json',
        body: sampleBody,
        captureTimestamp,
      }),
    ).rejects.toThrow('Unsupported recording content type: application/json')

    expect(recordingsBucket.put).not.toHaveBeenCalled()
  })

  it('routes to the recordings bucket only', async function run() {
    const { storage, recordingsBucket, screenshotsBucket } = createStorage()

    await storage.storeRecording({
      interviewId,
      recordingId,
      contentType: 'audio/webm',
      body: sampleBody,
      captureTimestamp,
    })

    expect(recordingsBucket.put).toHaveBeenCalledTimes(1)
    expect(screenshotsBucket.put).not.toHaveBeenCalled()
  })
})

describe('storeScreenshot', function storeScreenshotSuite() {
  it('stores with correct key and metadata', async function run() {
    const { storage, screenshotsBucket } = createStorage()

    const result = await storage.storeScreenshot({
      interviewId,
      screenshotId,
      contentType: 'image/png',
      body: sampleBody,
      captureTimestamp,
    })

    const expectedKey = buildScreenshotKey(interviewId, screenshotId)
    expect(screenshotsBucket.put).toHaveBeenCalledExactlyOnceWith({
      key: expectedKey,
      body: sampleBody,
      contentType: 'image/png',
      metadata: {
        interviewId,
        artifactKind: 'screenshot',
        contentType: 'image/png',
        captureTimestamp,
      },
    })
    expect(result.key).toBe(expectedKey)
    expect(result.metadata).toEqual({
      interviewId,
      artifactKind: 'screenshot',
      contentType: 'image/png',
      captureTimestamp,
    })
  })

  it('rejects non-png content types', async function run() {
    const { storage, screenshotsBucket } = createStorage()

    await expect(
      storage.storeScreenshot({
        interviewId,
        screenshotId,
        contentType: 'image/jpeg',
        body: sampleBody,
        captureTimestamp,
      }),
    ).rejects.toThrow('Unsupported screenshot content type: image/jpeg')

    expect(screenshotsBucket.put).not.toHaveBeenCalled()
  })

  it('rejects oversized bodies', async function run() {
    const oversizedBody = new Uint8Array(DEFAULT_ARTIFACT_STORAGE_CONFIG.maxScreenshotBytes + 1).buffer as ArrayBuffer
    const { storage, screenshotsBucket } = createStorage()

    await expect(
      storage.storeScreenshot({
        interviewId,
        screenshotId,
        contentType: 'image/png',
        body: oversizedBody,
        captureTimestamp,
      }),
    ).rejects.toThrow('Screenshot body exceeds maximum size')

    expect(screenshotsBucket.put).not.toHaveBeenCalled()
  })

  it('accepts a body exactly at the maximum size', async function run() {
    const boundaryBody = new Uint8Array(DEFAULT_ARTIFACT_STORAGE_CONFIG.maxScreenshotBytes).buffer as ArrayBuffer
    const { storage, screenshotsBucket } = createStorage()

    await storage.storeScreenshot({
      interviewId,
      screenshotId,
      contentType: 'image/png',
      body: boundaryBody,
      captureTimestamp,
    })

    expect(screenshotsBucket.put).toHaveBeenCalledTimes(1)
  })

  it('routes to the screenshots bucket only', async function run() {
    const { storage, recordingsBucket, screenshotsBucket } = createStorage()

    await storage.storeScreenshot({
      interviewId,
      screenshotId,
      contentType: 'image/png',
      body: sampleBody,
      captureTimestamp,
    })

    expect(screenshotsBucket.put).toHaveBeenCalledTimes(1)
    expect(recordingsBucket.put).not.toHaveBeenCalled()
  })
})

describe('getRecording', function getRecordingSuite() {
  it('returns null for missing objects', async function run() {
    const { storage } = createStorage()

    const result = await storage.getRecording(interviewId, recordingId)

    expect(result).toBeNull()
  })

  it('returns body and normalized metadata when object exists', async function run() {
    const recordingsBucket = createMockBucket()
    const body = new ReadableStream()
    const storedMetadata = {
      interviewId,
      artifactKind: 'playback_recording',
      contentType: 'audio/webm',
      captureTimestamp,
    }
    vi.mocked(recordingsBucket.get).mockResolvedValue({
      body,
      metadata: { ...storedMetadata },
    })
    const { storage } = createStorage(recordingsBucket)

    const result = await storage.getRecording(interviewId, recordingId)

    expect(recordingsBucket.get).toHaveBeenCalledWith(
      buildRecordingKey(interviewId, recordingId),
    )
    expect(result).toEqual({ body, metadata: storedMetadata })
  })
})

describe('getScreenshot', function getScreenshotSuite() {
  it('returns null for missing objects', async function run() {
    const { storage } = createStorage()

    const result = await storage.getScreenshot(interviewId, screenshotId)

    expect(result).toBeNull()
  })

  it('returns body and normalized metadata when object exists', async function run() {
    const screenshotsBucket = createMockBucket()
    const body = new ReadableStream()
    const storedMetadata = {
      interviewId,
      artifactKind: 'screenshot',
      contentType: 'image/png',
      captureTimestamp,
    }
    vi.mocked(screenshotsBucket.get).mockResolvedValue({
      body,
      metadata: { ...storedMetadata },
    })
    const { storage } = createStorage(createMockBucket(), screenshotsBucket)

    const result = await storage.getScreenshot(interviewId, screenshotId)

    expect(screenshotsBucket.get).toHaveBeenCalledWith(
      buildScreenshotKey(interviewId, screenshotId),
    )
    expect(result).toEqual({ body, metadata: storedMetadata })
  })
})

describe('deleteArtifact', function deleteArtifactSuite() {
  it('routes recording keys to the recordings bucket', async function run() {
    const { storage, recordingsBucket, screenshotsBucket } = createStorage()
    const key = buildRecordingKey(interviewId, recordingId)

    await storage.deleteArtifact(key)

    expect(recordingsBucket.delete).toHaveBeenCalledExactlyOnceWith(key)
    expect(screenshotsBucket.delete).not.toHaveBeenCalled()
  })

  it('routes screenshot keys to the screenshots bucket', async function run() {
    const { storage, recordingsBucket, screenshotsBucket } = createStorage()
    const key = buildScreenshotKey(interviewId, screenshotId)

    await storage.deleteArtifact(key)

    expect(screenshotsBucket.delete).toHaveBeenCalledExactlyOnceWith(key)
    expect(recordingsBucket.delete).not.toHaveBeenCalled()
  })

  it('rejects unrecognized key prefixes', async function run() {
    const { storage, recordingsBucket, screenshotsBucket } = createStorage()

    await expect(storage.deleteArtifact('unexpected/prefix/key')).rejects.toThrow(
      'Cannot delete artifact with unrecognized key prefix',
    )

    expect(recordingsBucket.delete).not.toHaveBeenCalled()
    expect(screenshotsBucket.delete).not.toHaveBeenCalled()
  })

  it('rejects path traversal keys', async function run() {
    const { storage, recordingsBucket, screenshotsBucket } = createStorage()

    await expect(storage.deleteArtifact('interviews/foo/screenshots/../../recording/bar')).rejects.toThrow(
      'Cannot delete artifact with unrecognized key prefix',
    )

    expect(recordingsBucket.delete).not.toHaveBeenCalled()
    expect(screenshotsBucket.delete).not.toHaveBeenCalled()
  })
})

describe('headArtifact', function headArtifactSuite() {
  it('routes recording keys to the recordings bucket', async function run() {
    const recordingsBucket = createMockBucket()
    vi.mocked(recordingsBucket.head).mockResolvedValue({
      size: 1024,
      contentType: 'audio/webm',
      metadata: {},
    })
    const { storage, screenshotsBucket } = createStorage(recordingsBucket)
    const key = buildRecordingKey(interviewId, recordingId)

    const result = await storage.headArtifact(key)

    expect(recordingsBucket.head).toHaveBeenCalledExactlyOnceWith(key)
    expect(screenshotsBucket.head).not.toHaveBeenCalled()
    expect(result).toEqual({ size: 1024, contentType: 'audio/webm' })
  })

  it('routes screenshot keys to the screenshots bucket', async function run() {
    const screenshotsBucket = createMockBucket()
    vi.mocked(screenshotsBucket.head).mockResolvedValue({
      size: 2048,
      contentType: 'image/png',
      metadata: {},
    })
    const { storage, recordingsBucket } = createStorage(createMockBucket(), screenshotsBucket)
    const key = buildScreenshotKey(interviewId, screenshotId)

    const result = await storage.headArtifact(key)

    expect(screenshotsBucket.head).toHaveBeenCalledExactlyOnceWith(key)
    expect(recordingsBucket.head).not.toHaveBeenCalled()
    expect(result).toEqual({ size: 2048, contentType: 'image/png' })
  })

  it('returns null for missing objects', async function run() {
    const { storage } = createStorage()

    const recordingHead = await storage.headArtifact(buildRecordingKey(interviewId, recordingId))
    const screenshotHead = await storage.headArtifact(buildScreenshotKey(interviewId, screenshotId))

    expect(recordingHead).toBeNull()
    expect(screenshotHead).toBeNull()
  })

  it('rejects unrecognized key prefixes', async function run() {
    const { storage } = createStorage()

    await expect(storage.headArtifact('unexpected/prefix/key')).rejects.toThrow(
      'Cannot head artifact with unrecognized key prefix',
    )
  })

  it('rejects path traversal keys', async function run() {
    const { storage } = createStorage()

    await expect(storage.headArtifact('interviews/foo/screenshots/../../recording/bar')).rejects.toThrow(
      'Cannot head artifact with unrecognized key prefix',
    )
  })
})

describe('artifact metadata', function metadataSuite() {
  it('does not contain PII unless explicitly provided', async function run() {
    const { storage, recordingsBucket } = createStorage()

    await storage.storeRecording({
      interviewId,
      recordingId,
      contentType: 'video/webm',
      body: sampleBody,
      captureTimestamp,
    })

    const putMetadata = vi.mocked(recordingsBucket.put).mock.calls[0][0].metadata
    expect(putMetadata).not.toHaveProperty('participantId')
    expect(putMetadata).not.toHaveProperty('participantRole')
    expect(putMetadata).not.toHaveProperty('userEmail')
    expect(Object.keys(putMetadata).sort()).toEqual([
      'artifactKind',
      'captureTimestamp',
      'contentType',
      'interviewId',
    ])
  })

  it('round-trips participant metadata on read', async function run() {
    const recordingsBucket = createMockBucket()
    const storedMetadata = {
      interviewId,
      artifactKind: 'playback_recording',
      contentType: 'audio/ogg',
      captureTimestamp,
      participantId: '44444444-4444-4444-8444-444444444444',
      participantRole: 'candidate',
    }
    vi.mocked(recordingsBucket.get).mockResolvedValue({
      body: new ReadableStream(),
      metadata: { ...storedMetadata },
    })
    const { storage } = createStorage(recordingsBucket)

    const result = await storage.getRecording(interviewId, recordingId)

    expect(result?.metadata).toEqual(storedMetadata)
  })
})

describe('createR2BucketPort', function r2PortSuite() {
  type MockR2BucketHead = {
    size: number
    httpMetadata?: { contentType?: string }
    customMetadata?: Record<string, string>
  }

  type MockR2BucketObject = {
    body: ReadableStream
    customMetadata?: Record<string, string>
  }

  function createMockR2Bucket() {
    return {
      put: vi.fn(async (_key: string, _value: unknown, _options: unknown) => undefined),
      head: vi.fn<(key: string) => Promise<MockR2BucketHead | null>>(async () => null),
      get: vi.fn<(key: string) => Promise<MockR2BucketObject | null>>(async () => null),
      delete: vi.fn<(key: string) => Promise<void>>(async () => undefined),
    }
  }

  it('wraps put with http metadata and custom metadata', async function run() {
    const bucket = createMockR2Bucket()
    const port = createR2BucketPort(bucket as unknown as R2Bucket)

    await port.put({
      key: 'interviews/abc/recording/rec-1',
      body: sampleBody,
      contentType: 'video/mp4',
      metadata: { interviewId: 'abc', artifactKind: 'playback_recording' },
    })

    expect(bucket.put).toHaveBeenCalledExactlyOnceWith(
      'interviews/abc/recording/rec-1',
      sampleBody,
      {
        httpMetadata: { contentType: 'video/mp4' },
        customMetadata: { interviewId: 'abc', artifactKind: 'playback_recording' },
      },
    )
  })

  it('wraps head and exposes size, contentType, and metadata', async function run() {
    const bucket = createMockR2Bucket()
    vi.mocked(bucket.head).mockResolvedValue({
      size: 42,
      httpMetadata: { contentType: 'image/png' },
      customMetadata: { interviewId: 'abc' },
    })
    const port = createR2BucketPort(bucket as unknown as R2Bucket)

    const result = await port.head('interviews/abc/screenshots/shot-1')

    expect(bucket.head).toHaveBeenCalledExactlyOnceWith('interviews/abc/screenshots/shot-1')
    expect(result).toEqual({
      size: 42,
      contentType: 'image/png',
      metadata: { interviewId: 'abc' },
    })
  })

  it('wraps head and returns null for missing objects', async function run() {
    const bucket = createMockR2Bucket()
    vi.mocked(bucket.head).mockResolvedValue(null)
    const port = createR2BucketPort(bucket as unknown as R2Bucket)

    const result = await port.head('interviews/abc/recording/missing')

    expect(result).toBeNull()
  })

  it('wraps get and exposes body with metadata', async function run() {
    const bucket = createMockR2Bucket()
    const body = new ReadableStream()
    vi.mocked(bucket.get).mockResolvedValue({
      body,
      customMetadata: { captureTimestamp },
    })
    const port = createR2BucketPort(bucket as unknown as R2Bucket)

    const result = await port.get('interviews/abc/recording/rec-1')

    expect(bucket.get).toHaveBeenCalledExactlyOnceWith('interviews/abc/recording/rec-1')
    expect(result).toEqual({ body, metadata: { captureTimestamp } })
  })

  it('wraps get and returns null for missing objects', async function run() {
    const bucket = createMockR2Bucket()
    vi.mocked(bucket.get).mockResolvedValue(null)
    const port = createR2BucketPort(bucket as unknown as R2Bucket)

    const result = await port.get('interviews/abc/recording/missing')

    expect(result).toBeNull()
  })

  it('wraps delete', async function run() {
    const bucket = createMockR2Bucket()
    const port = createR2BucketPort(bucket as unknown as R2Bucket)

    await port.delete('interviews/abc/screenshots/shot-1')

    expect(bucket.delete).toHaveBeenCalledExactlyOnceWith('interviews/abc/screenshots/shot-1')
  })
})
