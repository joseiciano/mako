import { createHealthResponse } from '@mako/shared'
import { backendRuntime } from '@mako/shared-backend'
import { Hono } from 'hono'

export type WorkerBindings = Record<string, unknown>

const app = new Hono<{ Bindings: WorkerBindings }>()

app.get('/', function rootHandler(c) {
  return c.json({
    message: 'Mako backend API is running.',
    runtime: backendRuntime,
  })
})

app.get('/health', function healthHandler(c) {
  return c.json(createHealthResponse('backend-rest'))
})

export default app
