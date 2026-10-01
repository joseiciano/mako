/**
 * Local test/dev stand-in for the `cloudflare:workflows` virtual module,
 * which only exists inside the real `workerd` runtime. Mirrors the ambient
 * type declared in `@cloudflare/workers-types` closely enough for unit
 * tests: setting `name` (defaulting to `NonRetryableError`) and `message`.
 */
export class NonRetryableError extends Error {
  constructor(message: string, name = 'NonRetryableError') {
    super(message)
    this.name = name
  }
}
