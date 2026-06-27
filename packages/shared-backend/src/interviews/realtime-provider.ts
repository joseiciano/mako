export type CreateRealtimeSessionInput = {
  interviewId: string
}

export type CreateRealtimeSessionResult = {
  realtimeSessionId: string
  excalidrawRoomId: string
  excalidrawKey: string
}

export type CreateParticipantTokenInput = {
  realtimeSessionId: string
  participantUserId: string
  participantName: string
  participantEmail: string
  interviewId: string
}

export type CreateParticipantTokenResult = {
  token: string
}

export type RealtimeProvider = {
  createSession(input: CreateRealtimeSessionInput): Promise<CreateRealtimeSessionResult>
  createParticipantToken(
    input: CreateParticipantTokenInput,
  ): Promise<CreateParticipantTokenResult>
}

export type RealtimeKitBindings = {
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_REALTIMEKIT_APP_ID?: string
}

export function createDemoRealtimeProvider(): RealtimeProvider {
  return {
    async createSession(input) {
      const id = input.interviewId
      return {
        realtimeSessionId: `realtime_${id}`,
        excalidrawRoomId: `excalidraw_room_${id}`,
        excalidrawKey: `excalidraw_key_${id}`,
      }
    },
    async createParticipantToken(input) {
      return { token: `realtime_token_${input.interviewId}` }
    },
  }
}

export function createRealtimeKitProvider(bindings: RealtimeKitBindings): RealtimeProvider {
  const accountId = bindings.CLOUDFLARE_ACCOUNT_ID
  const apiToken = bindings.CLOUDFLARE_API_TOKEN
  const appId = bindings.CLOUDFLARE_REALTIMEKIT_APP_ID

  if (!accountId || !apiToken || !appId) {
    throw new Error(
      'RealtimeKit provider requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_REALTIMEKIT_APP_ID.',
    )
  }

  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/realtime/kit/${appId}`

  return {
    async createSession(input) {
      const response = await fetch(`${baseUrl}/meetings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: `Interview ${input.interviewId}` }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown')
        throw new Error(
          `RealtimeKit meeting creation failed (${response.status}): ${errorText}`,
        )
      }

      const json = (await response.json()) as Record<string, unknown>
      const result = getResponseObject(json)
      const meetingId = typeof result.id === 'string' ? result.id : undefined

      if (!meetingId) {
        throw new Error('RealtimeKit meeting response missing id.')
      }

      const excalidrawRoomId = `excalidraw_room_${meetingId}`
      const excalidrawKey = `excalidraw_key_${meetingId}`

      return {
        realtimeSessionId: meetingId,
        excalidrawRoomId,
        excalidrawKey,
      }
    },

    async createParticipantToken(input) {
      const response = await fetch(
        `${baseUrl}/meetings/${input.realtimeSessionId}/participants`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: input.participantName,
            email: input.participantEmail,
            preset_name: 'default',
            custom_participant_id: input.participantUserId,
          }),
        },
      )

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown')
        throw new Error(
          `RealtimeKit participant token creation failed (${response.status}): ${errorText}`,
        )
      }

      const json = (await response.json()) as Record<string, unknown>
      const result = getResponseObject(json)
      const authToken = (typeof result.authToken === 'string'
        ? result.authToken
        : typeof result.auth_token === 'string'
          ? result.auth_token
        : typeof result.token === 'string'
          ? result.token
          : undefined) as string | undefined

      if (!authToken) {
        throw new Error('RealtimeKit participant response missing authToken.')
      }

      return { token: authToken }
    },
  }
}

function getResponseObject(json: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(json.data)) return json.data
  if (isRecord(json.result)) return json.result
  return json
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
