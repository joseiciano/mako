import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { assertLocalDatabaseUrl } from './database-guard.mjs'
import {
  buildPremiumSlots,
  premiumSlotOwnerEmail,
  seedPassword,
  seedUsers,
} from './seed-users.mjs'

const appOrigin = 'http://localhost:3000'

export async function userExists(client, email) {
  const result = await client.query('SELECT 1 FROM "user" WHERE email = $1', [email])

  return result.rows.length > 0
}

export async function signUpUser({ fetchImpl, workersUrl, user }) {
  const response = await fetchImpl(`${workersUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: appOrigin,
      'cf-connecting-ip': user.clientAddress,
    },
    body: JSON.stringify({ name: user.name, email: user.email, password: seedPassword }),
  })

  if (!response.ok) {
    throw new Error(
      `Sign-up for ${user.email} failed with status ${response.status}: ${await response.text()}`,
    )
  }
}

export async function applyRoles(client, user) {
  const result = await client.query(
    'UPDATE "user" SET "isAdmin" = $2, companies = $3, credits = GREATEST(credits, $4), "emailVerified" = TRUE, "updatedAt" = NOW() WHERE email = $1',
    [user.email, user.isAdmin, user.companies, user.credits],
  )

  if (result.rowCount !== 1) {
    throw new Error(`Role update for ${user.email} matched ${result.rowCount} rows`)
  }
}

export async function publishPremiumSlots(client, now) {
  for (const slot of buildPremiumSlots(now)) {
    await client.query(
      `INSERT INTO premium_interviewer_slots
         (id, interviewer_id, interview_type, start_time, end_time, status, created_at, updated_at)
       SELECT $1, u.id, $2, $3, $4, 'available', NOW(), NOW()
       FROM "user" u WHERE u.email = $5
       ON CONFLICT (id) DO UPDATE
         SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, updated_at = NOW()
         WHERE premium_interviewer_slots.status = 'available'
           AND premium_interviewer_slots.start_time < NOW()`,
      [slot.id, slot.interviewType, slot.startTime, slot.endTime, premiumSlotOwnerEmail],
    )
  }
}

export async function runSeed({ client, fetchImpl, workersUrl, now = new Date(), log = () => {} }) {
  for (const user of seedUsers) {
    if (await userExists(client, user.email)) {
      log(`exists  ${user.role} ${user.email}`)
    } else {
      await signUpUser({ fetchImpl, workersUrl, user })
      log(`created ${user.role} ${user.email}`)
    }

    await applyRoles(client, user)
  }

  await publishPremiumSlots(client, now)
}

async function main() {
  const databaseUrl = assertLocalDatabaseUrl(process.env.DATABASE_URL)
  const workersUrl = process.env.SEED_WORKERS_URL ?? 'http://workers:8787'
  const requireFromWorkingDirectory = createRequire(path.join(process.cwd(), 'noop.js'))
  const pg = requireFromWorkingDirectory('pg')
  const client = new pg.Client({ connectionString: databaseUrl })

  await client.connect()
  try {
    await runSeed({
      client,
      fetchImpl: fetch,
      workersUrl,
      log: (message) => process.stdout.write(`${message}\n`),
    })
  } finally {
    await client.end()
  }

  process.stdout.write(
    `Seed complete. Sign in at ${appOrigin} with password ${seedPassword} as:\n${seedUsers
      .map((user) => `  ${user.role.padEnd(20)} ${user.email}`)
      .join('\n')}\n`,
  )
}

if (process.argv[1]?.endsWith('seed.mjs')) {
  main().catch(function handleError(error) {
    process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
