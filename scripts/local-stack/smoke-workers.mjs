import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { composeProjectName } from './constants.mjs'

const appOrigin = process.env.LOCAL_APP_ORIGIN ?? 'http://localhost:3000'
const requestCount = Number(process.argv[2] ?? 40)
const paths = ['/api/auth/get-session', '/api/auth/sign-in/email']

function workersStatus() {
  const result = spawnSync(
    'docker',
    ['ps', '-a', '--filter', `name=${composeProjectName}-workers`, '--format', '{{.Status}}'],
    { encoding: 'utf8' },
  )

  return result.stdout.trim()
}

async function sendRequest(index) {
  const path = paths[index % paths.length]
  const response = await fetch(`${appOrigin}${path}`, {
    method: path.includes('sign-in') ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', origin: appOrigin },
    body: path.includes('sign-in')
      ? JSON.stringify({ email: 'smoke@example.com', password: 'not-a-real-password' })
      : undefined,
  })

  return response.status
}

const failures = []

for (let index = 0; index < requestCount; index += 1) {
  const status = await sendRequest(index)

  if (status >= 500) {
    failures.push(`request ${index + 1} ${paths[index % paths.length]} -> ${status}`)
  }
}

const status = workersStatus()

if (failures.length > 0 || !status.startsWith('Up')) {
  process.stderr.write(
    `Workers smoke failed. Container: ${status}\n${failures.join('\n')}\n`,
  )
  process.exit(1)
}

process.stdout.write(`Workers smoke passed: ${requestCount} requests, container ${status}\n`)
