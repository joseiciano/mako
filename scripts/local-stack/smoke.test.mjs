import { describe, expect, it } from 'vitest'
import { seedPassword, seedUsers } from './seed-users.mjs'
import {
  adminPath,
  healthPath,
  readSessionCookie,
  roleRoutes,
  smokeFetch,
  smokeOrigin,
} from './smoke-config.mjs'

const cookies = new Map()

async function signIn(user) {
  const { expectStatus } = await smokeFetch({
    check: `sign-in ${user.role}`,
    path: '/api/auth/sign-in/email',
    service: 'workers',
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: smokeOrigin,
        'cf-connecting-ip': user.clientAddress,
      },
      body: JSON.stringify({ email: user.email, password: seedPassword }),
    },
  })

  return expectStatus(200)
}

async function getWithCookie(check, path, cookie) {
  return smokeFetch({
    check,
    path,
    service: 'workers',
    init: { headers: { cookie, origin: smokeOrigin } },
  })
}

describe('local stack smoke', function describeSmoke() {
  it('frontend answers at http://localhost:3000', async function frontend() {
    const { expectStatus } = await smokeFetch({ check: 'frontend', path: '/' })

    expectStatus(200)
  })

  it('/api health answers through the frontend proxy', async function health() {
    const { expectStatus } = await smokeFetch({
      check: 'api health',
      path: healthPath,
      service: 'workers',
    })

    expectStatus(200)
  })

  describe.each(seedUsers)('$role', function describeUser(user) {
    it('signs in and receives a session cookie', async function signsIn() {
      const response = await signIn(user)
      const cookie = readSessionCookie(response)

      expect(cookie, `sign-in ${user.role} returned no session cookie`).toContain('session_token')
      cookies.set(user.role, cookie)
    })

    it('gets 200 on its authenticated route', async function authenticated() {
      const { expectStatus } = await getWithCookie(
        `${user.role} route`,
        roleRoutes[user.role],
        cookies.get(user.role),
      )

      expectStatus(200)
    })
  })

  it('non-admin gets 403 on an admin route', async function nonAdminForbidden() {
    const { expectStatus } = await getWithCookie('learner admin route', adminPath, cookies.get('learner'))

    expectStatus(403)
  })
})
