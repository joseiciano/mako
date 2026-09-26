import type { Context, Hono } from 'hono'
import type { BetterAuthLike } from './auth-config'

type ControllerBindings = Record<string, unknown>

export type AuthControllerOptions<Bindings extends ControllerBindings> = {
  getAuth: (
    context: Context<{ Bindings: Bindings }>,
  ) => BetterAuthLike | Promise<BetterAuthLike | null> | null
}

function isRegistrationRequest(c: Context): boolean {
  return c.req.method === 'POST' && c.req.path === '/api/auth/sign-up/email'
}

export function registerAuthController<Bindings extends ControllerBindings>(
  app: Hono<{ Bindings: Bindings }>,
  options: AuthControllerOptions<Bindings>,
): void {
  app.on(['GET', 'POST'], '/api/auth/*', async function authHandler(c) {
    const auth = await options.getAuth(c)
    const isRegistration = isRegistrationRequest(c)

    if (isRegistration) {
      console.log({
        level: 'info',
        message: 'Auth registration request received',
        method: c.req.method,
        path: c.req.path,
      })
    }

    if (!auth) {
      if (isRegistration) {
        console.log({
          level: 'info',
          message: 'Auth registration request completed',
          method: c.req.method,
          path: c.req.path,
          status: 503,
          success: false,
        })
      }

      return c.json(
        {
          error: 'Authentication is temporarily unavailable.',
        },
        503,
      )
    }

    try {
      const response = await auth.handler(c.req.raw)

      if (isRegistration) {
        console.log({
          level: 'info',
          message: 'Auth registration request completed',
          method: c.req.method,
          path: c.req.path,
          status: response.status,
          success: response.ok,
        })
      }

      return response
    } catch (error) {
      if (isRegistration) {
        console.log({
          level: 'info',
          message: 'Auth registration request completed',
          method: c.req.method,
          path: c.req.path,
          status: 500,
          success: false,
        })
      }

      throw error
    }
  })
}
