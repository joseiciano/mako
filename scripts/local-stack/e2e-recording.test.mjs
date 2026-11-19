import { describe, expect, it } from 'vitest'
import { fakesHostPort } from './constants.mjs'
import { seedPassword, seedUsers } from './seed-users.mjs'
import { SmokeError, readSessionCookie, smokeFetch, smokeOrigin } from './smoke-config.mjs'

const fakesOrigin = `http://localhost:${fakesHostPort}`
const learner = seedUsers.find((user) => user.role === 'learner')
const readyTimeoutMs = 60_000
const pollIntervalMs = 1_000
const consentCopyVersion = 'local-e2e'

async function fakesFetch(path, init) {
  try {
    return await fetch(`${fakesOrigin}${path}`, init)
  } catch (error) {
    throw new SmokeError(
      `fakes ${path}`,
      'fakes',
      `${fakesOrigin} is unreachable (${error.cause?.code ?? error.message}). Start the stack with LOCAL_FAKES=1 pnpm local:up.`,
    )
  }
}

async function learnerCall(cookie, check, method, path, body) {
  const { response } = await smokeFetch({
    check,
    path,
    service: 'workers',
    init: {
      method,
      headers: { cookie, origin: smokeOrigin, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  })

  if (!response.ok) {
    throw new SmokeError(check, 'workers', `${method} ${path} returned ${response.status}: ${await response.text()}`)
  }

  return response.json()
}

async function signInLearner() {
  const { response } = await smokeFetch({
    check: 'sign-in learner',
    path: '/api/auth/sign-in/email',
    service: 'workers',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: smokeOrigin, 'cf-connecting-ip': learner.clientAddress },
      body: JSON.stringify({ email: learner.email, password: seedPassword }),
    },
  })

  if (response.status !== 200) {
    throw new SmokeError('sign-in learner', 'workers', `returned ${response.status}; run pnpm local:up first`)
  }

  return readSessionCookie(response)
}

async function startedRecordingIds() {
  const response = await fakesFetch('/realtimekit/recordings')

  return (await response.json()).recordings.map((recording) => recording.recording_id)
}

async function pollRecordingStatus(cookie, interviewId) {
  const deadline = Date.now() + readyTimeoutMs
  let status

  while (Date.now() < deadline) {
    status = (await learnerCall(cookie, 'read interview', 'GET', `/api/interviews/${interviewId}`)).interview
      .recording_status

    if (status === 'ready') {
      return status
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new SmokeError(
    'recording ready',
    'workers',
    `recording_status was "${status}" after ${readyTimeoutMs}ms; read the finalization steps with docker compose -p mako-local -f docker-compose.local.yml logs workers`,
  )
}

describe('simulated recording upload (fakes on)', function describeE2e() {
  it('books with seeded credits, provisions, receives a signed UPLOADED webhook and marks the recording ready', async function bookToReady() {
    const cookie = await signInLearner()
    const before = new Set(await startedRecordingIds())

    const { interview } = await learnerCall(cookie, 'book interview', 'POST', '/api/interviews', {
      type: 'coding',
      mode: 'ai_led',
      scheduled_at: 'now',
    })
    const base = `/api/interviews/${interview.id}`

    await learnerCall(cookie, 'provision room', 'POST', `${base}/provision`)
    await learnerCall(cookie, 'recording consent', 'POST', `${base}/recording-consent`, {
      decision: 'consented',
      consent_copy_version: consentCopyVersion,
    })
    await learnerCall(cookie, 'start interview', 'POST', `${base}/start`)

    const started = (await startedRecordingIds()).filter((id) => !before.has(id))
    expect(started, 'starting the interview should start a composite and a track recording').toHaveLength(2)

    for (const recordingId of started) {
      const response = await fakesFetch('/realtimekit/recording-uploaded', {
        method: 'POST',
        body: JSON.stringify({ recording_id: recordingId }),
      })

      expect(response.status, await response.text()).toBe(200)
    }

    expect(await pollRecordingStatus(cookie, interview.id)).toBe('ready')
  })

  it('rejects a webhook signed with the wrong key', async function rejectsBadSignature() {
    const recordingId = crypto.randomUUID()
    const { response } = await smokeFetch({
      check: 'wrongly signed webhook',
      path: '/api/webhooks/realtimekit',
      service: 'workers',
      init: {
        method: 'POST',
        headers: { 'rtk-signature': btoa('not a real signature'), 'rtk-uuid': crypto.randomUUID() },
        body: JSON.stringify({
          event: 'recording.statusUpdate',
          recording: { id: recordingId, recordingId, status: 'UPLOADED' },
        }),
      },
    })

    expect(response.status).toBe(401)
  })
})
