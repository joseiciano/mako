import type { Hono } from 'hono'
import type { CreditService } from './credit-service'

export type CreditControllerOptions<Bindings extends object = object> = {
  createService: (context: { bindings: Bindings }) => CreditService
}

export function registerCreditController<Bindings extends object = object>(
  app: Hono<{ Bindings: Bindings }>,
  options: CreditControllerOptions<Bindings>,
): void {
  void app
  void options
}
