import type { Context, Hono } from 'hono'
import type { BetterAuthLike } from './auth-config'

type ControllerBindings = Record<string, unknown>

export type AuthControllerOptions<Bindings extends ControllerBindings> = {
  getAuth: (
    context: Context<{ Bindings: Bindings }>,
  ) => BetterAuthLike | Promise<BetterAuthLike | null> | null
}

export function registerAuthController<Bindings extends ControllerBindings>(
  app: Hono<{ Bindings: Bindings }>,
  options: AuthControllerOptions<Bindings>,
): void {
  app.on(['GET', 'POST'], '/api/auth/*', async function authHandler(c) {
    const auth = await options.getAuth(c)

    if (!auth) {
      return c.json(
        {
          error:
            'Better Auth is not configured. Set HYPERDRIVE and BETTER_AUTH_SECRET.',
        },
        503,
      )
    }

    return auth.handler(c.req.raw)
  })
}
