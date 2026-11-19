export const smokeOrigin = 'http://localhost:3000'
export const healthPath = '/api/auth/ok'
export const adminPath = '/api/admin/applications'

export const roleRoutes = {
  learner: '/api/account',
  interviewer: '/api/interviewer/status',
  'verified-interviewer': '/api/premium/interviewer/slots',
  admin: '/api/admin/applications',
}

export function serviceForStatus(status) {
  if (status === 503) {
    return 'postgres'
  }

  return status >= 500 ? 'workers' : 'frontend'
}

export class SmokeError extends Error {
  constructor(check, service, detail) {
    super(`Smoke check "${check}" failed (likely service: ${service}): ${detail}`)
    this.name = 'SmokeError'
  }
}

export async function smokeFetch({ check, path, service = 'frontend', init = {} }) {
  let response

  try {
    response = await fetch(`${smokeOrigin}${path}`, init)
  } catch (error) {
    throw new SmokeError(check, 'frontend', `${smokeOrigin} is unreachable (${error.cause?.code ?? error.message}). Run pnpm local:up.`)
  }

  return {
    response,
    expectStatus(expected) {
      if (response.status !== expected) {
        const hint = response.status >= 500 ? serviceForStatus(response.status) : service
        throw new SmokeError(check, hint, `${path} returned ${response.status}, expected ${expected}`)
      }

      return response
    },
  }
}

export function readSessionCookie(response) {
  const pairs = response.headers.getSetCookie().map((cookie) => cookie.split(';')[0])

  return pairs.join('; ')
}
