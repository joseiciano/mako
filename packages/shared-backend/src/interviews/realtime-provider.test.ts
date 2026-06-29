import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  createDemoRealtimeProvider,
  createRealtimeKitProvider,
} from './realtime-provider'

describe('RealtimeProvider', function realtimeProviderSuite() {
  afterEach(function restore() {
    vi.restoreAllMocks()
  })

  describe('createDemoRealtimeProvider', function demoProviderSuite() {
    it('creates session with deterministic realtime id and excalidraw credentials', async function run() {
      const provider = createDemoRealtimeProvider()
      const result = await provider.createSession({ interviewId: 'abc-123' })

      expect(result).toEqual({
        realtimeSessionId: 'realtime_abc-123',
        excalidrawRoomId: 'excalidraw_room_abc-123',
        excalidrawKey: 'excalidraw_key_abc-123',
      })
    })

    it('creates participant token with realtime_token_ prefix', async function run() {
      const provider = createDemoRealtimeProvider()
      const result = await provider.createParticipantToken({
        realtimeSessionId: 'realtime_abc-123',
        participantUserId: 'user-123',
        participantName: 'Test User',
        participantEmail: 'test@example.com',
        interviewId: 'abc-123',
      })

      expect(result.token).toMatch(/^realtime_token_/)
    })
  })

  describe('createRealtimeKitProvider', function realtimeKitProviderSuite() {
    it('throws when CLOUDFLARE_ACCOUNT_ID is missing', function run() {
      expect(() =>
        createRealtimeKitProvider({
          CLOUDFLARE_API_TOKEN: 'token',
          CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-id',
        }),
      ).toThrow('RealtimeKit provider requires')
    })

    it('throws when CLOUDFLARE_API_TOKEN is missing', function run() {
      expect(() =>
        createRealtimeKitProvider({
          CLOUDFLARE_ACCOUNT_ID: 'account',
          CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-id',
        }),
      ).toThrow('RealtimeKit provider requires')
    })

    it('throws when CLOUDFLARE_REALTIMEKIT_APP_ID is missing', function run() {
      expect(() =>
        createRealtimeKitProvider({
          CLOUDFLARE_ACCOUNT_ID: 'account',
          CLOUDFLARE_API_TOKEN: 'token',
        }),
      ).toThrow('RealtimeKit provider requires')
    })

    it('creates session by posting to meetings endpoint', async function run() {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { id: 'meeting-456' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

      const provider = createRealtimeKitProvider({
        CLOUDFLARE_ACCOUNT_ID: 'acct-1',
        CLOUDFLARE_API_TOKEN: 'tok-1',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-1',
      })

      const result = await provider.createSession({ interviewId: 'int-789' })

      expect(result).toEqual({
        realtimeSessionId: 'meeting-456',
        excalidrawRoomId: 'excalidraw_room_meeting-456',
        excalidrawKey: 'excalidraw_key_meeting-456',
      })

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/acct-1/realtime/kit/app-1/meetings',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer tok-1',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title: 'Interview int-789' }),
        }),
      )
    })

    it('accepts meeting id at top-level when result wrapper is absent', async function run() {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'top-level-id' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

      const provider = createRealtimeKitProvider({
        CLOUDFLARE_ACCOUNT_ID: 'acct',
        CLOUDFLARE_API_TOKEN: 'tok',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
      })

      const result = await provider.createSession({ interviewId: 'int-1' })
      expect(result.realtimeSessionId).toBe('top-level-id')
    })

    it('throws on API failure without leaking secrets', async function run() {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ errors: ['unauthorized'] }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      )

      const provider = createRealtimeKitProvider({
        CLOUDFLARE_ACCOUNT_ID: 'acct',
        CLOUDFLARE_API_TOKEN: 'secret-token',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
      })

      const error = await provider.createSession({ interviewId: 'int-1' }).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain('RealtimeKit meeting creation failed (401)')
      expect((error as Error).message).not.toContain('secret-token')
    })

    it('throws when meeting response has no id', async function run() {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ result: {} }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

      const provider = createRealtimeKitProvider({
        CLOUDFLARE_ACCOUNT_ID: 'acct',
        CLOUDFLARE_API_TOKEN: 'tok',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
      })

      await expect(
        provider.createSession({ interviewId: 'int-1' }),
      ).rejects.toThrow('meeting response missing id')
    })

    it('creates participant token by posting to participants endpoint', async function run() {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { token: 'auth-tok-xyz' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

      const provider = createRealtimeKitProvider({
        CLOUDFLARE_ACCOUNT_ID: 'acct',
        CLOUDFLARE_API_TOKEN: 'tok',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
      })

      const result = await provider.createParticipantToken({
        realtimeSessionId: 'meeting-1',
        participantUserId: 'user-1',
        participantName: 'Jane Doe',
        participantEmail: 'jane@example.com',
        interviewId: 'int-1',
      })

      expect(result).toEqual({ token: 'auth-tok-xyz' })

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/acct/realtime/kit/app/meetings/meeting-1/participants',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'Jane Doe',
            email: 'jane@example.com',
            preset_name: 'default',
            custom_participant_id: 'user-1',
          }),
        }),
      )
    })

    it('accepts token fallback when authToken is absent', async function run() {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ result: { token: 'fallback-tok' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

      const provider = createRealtimeKitProvider({
        CLOUDFLARE_ACCOUNT_ID: 'acct',
        CLOUDFLARE_API_TOKEN: 'tok',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
      })

      const result = await provider.createParticipantToken({
        realtimeSessionId: 'meeting-1',
        participantUserId: 'user-1',
        participantName: 'Jane',
        participantEmail: 'jane@example.com',
        interviewId: 'int-1',
      })

      expect(result.token).toBe('fallback-tok')
    })

    it('throws on participant token API failure without leaking token', async function run() {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ errors: ['not found'] }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      )

      const provider = createRealtimeKitProvider({
        CLOUDFLARE_ACCOUNT_ID: 'acct',
        CLOUDFLARE_API_TOKEN: 'secret-tok',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
      })

      await expect(
        provider.createParticipantToken({
          realtimeSessionId: 'meeting-1',
          participantUserId: 'user-1',
          participantName: 'Jane',
          participantEmail: 'jane@example.com',
          interviewId: 'int-1',
        }),
      ).rejects.toThrow('RealtimeKit participant token creation failed (404)')
    })

    it('throws when participant response has no authToken', async function run() {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ result: {} }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

      const provider = createRealtimeKitProvider({
        CLOUDFLARE_ACCOUNT_ID: 'acct',
        CLOUDFLARE_API_TOKEN: 'tok',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app',
      })

      await expect(
        provider.createParticipantToken({
          realtimeSessionId: 'meeting-1',
          participantUserId: 'user-1',
          participantName: 'Jane',
          participantEmail: 'jane@example.com',
          interviewId: 'int-1',
        }),
      ).rejects.toThrow('participant response missing authToken')
    })
  })
})
