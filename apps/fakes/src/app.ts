import { type FakeHandler, hasAuthorization, jsonResponse, notFound, unauthorized } from './http.ts'
import { handleRealtimeRecordings } from './routes/realtime-recordings.ts'
import { handleRealtimeRooms } from './routes/realtime-rooms.ts'

const REALTIME_KIT_PREFIX = /^\/client\/v4\/accounts\/[^/]+\/realtime\/kit\/[^/]+/

export const handleRequest: FakeHandler = async (request) => {
  const { pathname } = new URL(request.url)

  if (pathname === '/health') return jsonResponse({ ok: true })

  const prefix = REALTIME_KIT_PREFIX.exec(pathname)
  if (!prefix) return notFound()
  if (!hasAuthorization(request)) return unauthorized()

  const path = pathname.slice(prefix[0].length)
  const response =
    (await handleRealtimeRooms(request, path)) ?? (await handleRealtimeRecordings(request, path))

  return response ?? notFound()
}
