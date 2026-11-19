import { spawn } from 'node:child_process'
import process from 'node:process'
import {
  composeFilePath,
  composeProjectName,
  defaultDatabaseUrl,
  postgresHostPort,
  rootDirectory,
  workersHostPort,
} from './constants.mjs'
import { assertLocalDatabaseUrl } from './database-guard.mjs'

function composeArgs(...args) {
  return ['compose', '-p', composeProjectName, '-f', composeFilePath, ...args]
}

function buildEnvironment() {
  const databaseUrl = assertLocalDatabaseUrl(
    process.env.LOCAL_DATABASE_URL ?? defaultDatabaseUrl,
  )

  return {
    ...process.env,
    LOCAL_DATABASE_URL: databaseUrl,
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

async function startAndMigrate(environment) {
  await runCompose(['up', '-d', '--build', '--wait', 'postgres'], environment)
  await runCompose(
    ['up', '--build', '--no-deps', '--exit-code-from', 'migrate', 'migrate'],
    environment,
  )
  await runCompose(['up', '-d', '--no-deps', '--wait', 'workers'], environment)
  await runCompose(['up', '-d', '--no-deps', '--wait', 'frontend'], environment)
}

async function up() {
  await startAndMigrate(buildEnvironment())
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
}

const commands = { up, down, reset }

async function main() {
  const handler = Object.hasOwn(commands, process.argv[2] ?? 'up')
    ? commands[process.argv[2] ?? 'up']
    : undefined

  if (!handler) {
    process.exitCode = 1
    process.stderr.write(
      'Usage: pnpm local:up | pnpm local:down | pnpm local:reset\n  up     start Postgres, run migrations, start workers and frontend\n  down   stop the local stack\n  reset  wipe all local data and start clean\n',
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
