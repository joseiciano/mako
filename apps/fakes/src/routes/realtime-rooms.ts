import { jsonResponse } from '../http.ts'

const MEETINGS_PATH = /^\/meetings$/
const PARTICIPANTS_PATH = /^\/meetings\/([^/]+)\/participants$/

/**
 * Fakes the RealtimeKit meeting routes `createRealtimeKitProvider` calls:
 * POST /meetings and POST /meetings/:id/participants. `path` is relative to
 * `/accounts/:accountId/realtime/kit/:appId`.
 */
export const handleRealtimeRooms = async (
  request: Request,
  path: string,
): Promise<Response | null> => {
  if (request.method !== 'POST') return null

  if (MEETINGS_PATH.test(path)) {
    const body = (await request.json().catch(() => ({}))) as { title?: unknown }
    return jsonResponse({
      success: true,
      data: {
        id: `fake-meeting-${crypto.randomUUID()}`,
        title: typeof body.title === 'string' ? body.title : 'Fake meeting',
        status: 'ACTIVE',
      },
    })
  }

  const participant = PARTICIPANTS_PATH.exec(path)
  if (participant) {
    return jsonResponse({
      success: true,
      data: {
        id: `fake-participant-${crypto.randomUUID()}`,
        token: `fake-participant-token-${crypto.randomUUID()}`,
      },
    })
  }

  return null
}
