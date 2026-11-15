import { describe, expectTypeOf, it } from 'vitest'
import type { AuthClientUser } from './auth-client'

describe('AuthClientUser', function () {
  it('types isAdmin as boolean', function () {
    expectTypeOf<AuthClientUser['isAdmin']>().toEqualTypeOf<boolean>()
  })
})
