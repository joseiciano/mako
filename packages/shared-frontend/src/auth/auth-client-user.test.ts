import { describe, expectTypeOf, it } from 'vitest'
import type { AuthClientUser } from './auth-client'

describe('AuthClientUser type', function () {
  it('exposes the server-owned isAdmin flag as a boolean', function () {
    expectTypeOf<AuthClientUser['isAdmin']>().toEqualTypeOf<boolean>()
  })
})
