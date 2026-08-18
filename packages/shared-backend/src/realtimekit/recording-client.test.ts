import { describe, expect, it, vi } from 'vitest'
import {
  RealtimeKitRecordingClientError,
  createDemoRealtimeKitRecordingClient,
  createRealtimeKitRecordingClient,
  type RealtimeKitRecordingStatusResult,
} from './recording-client'

const RECORDING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('createRealtimeKitRecordingClient', function recordingClientSuite() {
  it('throws when RealtimeKit credentials are missing', function run() {
    expect(() =>
      createRealtimeKitRecordingClient({}),
    ).toThrow(/CLOUDFLARE_ACCOUNT_ID/)
  })

  it('fetches fresh recording status and download URLs by provider recording id', async function run() {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            recording: {
              id: RECORDING_ID,
              state: 'UPLOADED',
              captured_at: '2026-08-17T11:00:00.000Z',
              assets: [
                {
                  id: 'asset-composite',
                  kind: 'mp4',
                  url: 'https://api.realtime.cloudflare.com/downloads/composite.mp4',
                  content_type: 'video/mp4',
                },
                {
                  id: 'asset-track',
                  kind: 'm4a',
                  url: 'https://api.realtime.cloudflare.com/downloads/track.m4a',
                  content_type: 'audio/mp4',
                },
              ],
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const client = createRealtimeKitRecordingClient(
      {
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-id',
      },
      { fetch: fetchMock },
    )

    const result = await client.getRecordingStatus(RECORDING_ID)

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://api.cloudflare.com/client/v4/accounts/account-id/realtime/kit/app-id/recordings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    )
    expect(result).toEqual({
      recordingId: RECORDING_ID,
      state: 'UPLOADED',
      capturedAt: '2026-08-17T11:00:00.000Z',
      assets: [
        {
          assetId: 'asset-composite',
          kind: 'composite',
          downloadUrl: 'https://api.realtime.cloudflare.com/downloads/composite.mp4',
          contentType: 'video/mp4',
        },
        {
          assetId: 'asset-track',
          kind: 'participant_track',
          downloadUrl: 'https://api.realtime.cloudflare.com/downloads/track.m4a',
          contentType: 'audio/mp4',
        },
      ],
    })
  })

  it('throws on a non-ok provider response', async function run() {
    const fetchMock = vi.fn(async () => new Response('error', { status: 500 }))

    const client = createRealtimeKitRecordingClient(
      {
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-id',
      },
      { fetch: fetchMock },
    )

    await expect(client.getRecordingStatus(RECORDING_ID)).rejects.toThrow(
      RealtimeKitRecordingClientError,
    )
  })

  it('throws when the response omits the recording id', async function run() {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: { recording: { state: 'UPLOADED' } } }),
        { status: 200 },
      ),
    )

    const client = createRealtimeKitRecordingClient(
      {
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-id',
      },
      { fetch: fetchMock },
    )

    await expect(client.getRecordingStatus(RECORDING_ID)).rejects.toThrow(
      RealtimeKitRecordingClientError,
    )
  })

  it('rejects a status response whose recording id does not exactly match the requested provider recording id', async function run() {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            recording: {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              state: 'UPLOADED',
              assets: [],
            },
          },
        }),
        { status: 200 },
      ),
    )

    const client = createRealtimeKitRecordingClient(
      {
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-id',
      },
      { fetch: fetchMock },
    )

    await expect(client.getRecordingStatus(RECORDING_ID)).rejects.toThrow(
      RealtimeKitRecordingClientError,
    )
  })

  it('maps an explicit participant_track kind regardless of the asset id', async function run() {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            recording: {
              id: RECORDING_ID,
              state: 'UPLOADED',
              assets: [
                {
                  id: 'asset-participant-track-001',
                  kind: 'participant_track',
                  url: 'https://api.realtime.cloudflare.com/downloads/participant-track-001',
                  content_type: 'audio/mp4',
                },
                {
                  id: 'asset-composite-001',
                  kind: 'mp4',
                  url: 'https://api.realtime.cloudflare.com/downloads/composite-001',
                  content_type: 'video/mp4',
                },
              ],
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const client = createRealtimeKitRecordingClient(
      {
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-id',
      },
      { fetch: fetchMock },
    )

    const result = await client.getRecordingStatus(RECORDING_ID)

    expect(result.assets).toEqual([
      {
        assetId: 'asset-participant-track-001',
        kind: 'participant_track',
        downloadUrl: 'https://api.realtime.cloudflare.com/downloads/participant-track-001',
        contentType: 'audio/mp4',
      },
      {
        assetId: 'asset-composite-001',
        kind: 'composite',
        downloadUrl: 'https://api.realtime.cloudflare.com/downloads/composite-001',
        contentType: 'video/mp4',
      },
    ])
  })

  it('prefers an explicit provider kind over filename heuristics', async function run() {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            recording: {
              id: RECORDING_ID,
              state: 'UPLOADED',
              assets: [
                {
                  id: 'legacy-track.m4a',
                  kind: 'mp4',
                  url: 'https://api.realtime.cloudflare.com/downloads/legacy-track.m4a',
                  content_type: 'video/mp4',
                },
              ],
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const client = createRealtimeKitRecordingClient(
      {
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-id',
      },
      { fetch: fetchMock },
    )

    const result = await client.getRecordingStatus(RECORDING_ID)

    expect(result.assets[0].kind).toBe('composite')
  })

  it('throws when an asset kind cannot be resolved instead of defaulting to composite', async function run() {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            recording: {
              id: RECORDING_ID,
              state: 'UPLOADED',
              assets: [
                {
                  id: 'asset-unresolved-001',
                  url: 'https://api.realtime.cloudflare.com/downloads/asset-unresolved-001',
                  content_type: 'video/mp4',
                },
              ],
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const client = createRealtimeKitRecordingClient(
      {
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-id',
      },
      { fetch: fetchMock },
    )

    await expect(client.getRecordingStatus(RECORDING_ID)).rejects.toThrow(
      RealtimeKitRecordingClientError,
    )
  })
})

describe('createDemoRealtimeKitRecordingClient', function demoClientSuite() {
  it('returns configured statuses for a provider recording id', async function run() {
    const status: RealtimeKitRecordingStatusResult = {
      recordingId: RECORDING_ID,
      state: 'UPLOADED',
      capturedAt: null,
      assets: [],
    }
    const client = createDemoRealtimeKitRecordingClient({
      [RECORDING_ID]: status,
    })

    await expect(client.getRecordingStatus(RECORDING_ID)).resolves.toEqual(status)
  })

  it('throws for an unknown provider recording id', async function run() {
    const client = createDemoRealtimeKitRecordingClient({})

    await expect(client.getRecordingStatus(RECORDING_ID)).rejects.toThrow(
      RealtimeKitRecordingClientError,
    )
  })
})
