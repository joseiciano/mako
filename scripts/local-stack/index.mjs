import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  composeFilePath,
  composeProjectName,
  defaultDatabaseUrl,
  fakesApiBaseUrl,
  fakesHostPort,
  postgresHostPort,
  rootDirectory,
  workersHostPort,
} from './constants.mjs'
import { assertLocalDatabaseUrl } from './database-guard.mjs'
import { isFakesEnabled } from './fakes-setting.mjs'

function composeArgs(...args) {
  return ['compose', '-p', composeProjectName, '--profile', 'fakes', '-f', composeFilePath, ...args]
}

function readDotEnv() {
  try {
    return readFileSync(path.join(rootDirectory, '.env'), 'utf8')
  } catch {
    return ''
  }
}

function fakesEnabled() {
  return isFakesEnabled(process.env, readDotEnv())
}

function buildEnvironment() {
  const databaseUrl = assertLocalDatabaseUrl(
    process.env.LOCAL_DATABASE_URL ?? defaultDatabaseUrl,
  )

  return {
    ...process.env,
    LOCAL_DATABASE_URL: databaseUrl,
    LOCAL_CLOUDFLARE_API_BASE_URL: fakesEnabled() ? fakesApiBaseUrl : '',
    LOCAL_FAKES_ENABLED: fakesEnabled() ? '1' : '',
    LOCAL_FAKES_PORT: String(fakesHostPort),
    LOCAL_POSTGRES_PORT: String(postgresHostPort),
    LOCAL_WORKERS_PORT: String(workersHostPort),
  }
}

function runCompose(args, environment) {
  return new Promise(function executeCompose(resolve, reject) {
    const childProcess = spawn('docker', composeArgs(...args), {
      cwd: rootDirectory,
      env: environment,
      stdio: 'inherit',
    })

    childProcess.on('error', reject)
    childProcess.on('exit', function handleExit(code) {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`docker compose ${args.join(' ')} exited with status ${code}`))
    })
  })
}

async function syncFakes(environment) {
  if (fakesEnabled()) {
    await runCompose(['up', '-d', '--build', '--no-deps', '--wait', 'fakes'], environment)
  } else {
    await runCompose(['rm', '--stop', '--force', 'fakes'], environment)
  }
}

async function startAndMigrate(environment) {
  await runCompose(['up', '-d', '--build', '--wait', 'postgres'], environment)
  await runCompose(
    ['up', '--build', '--no-deps', '--exit-code-from', 'migrate', 'migrate'],
    environment,
  )
  await syncFakes(environment)
  await runCompose(['up', '-d', '--no-deps', '--wait', 'workers'], environment)
  await runCompose(['up', '-d', '--no-deps', '--wait', 'frontend'], environment)
}

async function runSeed(environment) {
  await runCompose(['up', '--no-deps', '--exit-code-from', 'seed', 'seed'], environment)
}

async function seed() {
  const environment = buildEnvironment()

  await runCompose(['up', '-d', '--wait', 'postgres'], environment)
  await syncFakes(environment)
  await runCompose(['up', '-d', '--wait', 'workers'], environment)
  await runSeed(environment)
}

async function up() {
  const environment = buildEnvironment()

  await startAndMigrate(environment)
  await runSeed(environment)
  process.stdout.write(
    `Local stack up: Postgres on localhost:${postgresHostPort}, migrations applied, workers on http://localhost:${workersHostPort}, app on http://localhost:3000.\n`,
  )
}

async function down() {
  await runCompose(['down', '--remove-orphans'], buildEnvironment())
}

async function reset() {
  const environment = buildEnvironment()

  await runCompose(['down', '--volumes', '--remove-orphans'], environment)
  await startAndMigrate(environment)
  await runSeed(environment)
}

const commands = { up, down, reset, seed }

async function main() {
  const handler = Object.hasOwn(commands, process.argv[2] ?? 'up')
    ? commands[process.argv[2] ?? 'up']
    : undefined

  if (!handler) {
    process.exitCode = 1
    process.stderr.write(
      'Usage: pnpm local:up | pnpm local:down | pnpm local:reset | pnpm local:seed\n  up     start Postgres, run migrations, start workers and frontend, seed users\n  down   stop the local stack\n  reset  wipe all local data and start clean\n  seed   create the four role users and premium slots (safe to repeat)\n',
    )
    return
  }

  await handler()
}

main().catch(function handleError(error) {
  process.stderr.write(
    `Local stack failed: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
})
