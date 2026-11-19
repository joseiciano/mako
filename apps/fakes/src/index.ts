import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { handleRequest } from './app.ts'

const port = Number(process.env.FAKES_PORT ?? 8790)

const server = createServer(async (incoming, outgoing) => {
  try {
    const hasBody = incoming.method !== 'GET' && incoming.method !== 'HEAD'
    const request = new Request(`http://${incoming.headers.host ?? 'fakes'}${incoming.url ?? '/'}`, {
      method: incoming.method,
      headers: incoming.headers as Record<string, string>,
      body: hasBody ? (Readable.toWeb(incoming) as ReadableStream) : undefined,
      duplex: 'half',
    } as RequestInit)
    const response = await handleRequest(request)

    console.log(`[fakes] ${incoming.method} ${incoming.url} -> ${response.status}`)
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    console.error('[fakes] request failed', error)
    outgoing.writeHead(500, { 'content-type': 'application/json' })
    outgoing.end(JSON.stringify({ success: false }))
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`[fakes] listening on :${port}`)
})
