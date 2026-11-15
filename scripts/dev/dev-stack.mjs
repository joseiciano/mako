import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const composeFilePath = path.join(rootDirectory, 'docker-compose.dev.yml')
const envFilePath = path.join(rootDirectory, '.env')
const envExampleFilePath = path.join(rootDirectory, '.env.example')

const backendDirectory = path.join(rootDirectory, 'apps/backend-rest')
const orchestratorDirectory = path.join(
  rootDirectory,
  'apps/notification-orchestrator',
)
const matcherDirectory = path.join(rootDirectory, 'apps/greedy-matcher')
const frontendDirectory = path.join(rootDirectory, 'apps/frontend')

const backendSecretNames = [
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'BETTER_AUTH_TRUSTED_ORIGINS',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_REALTIMEKIT_APP_ID',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'AUTH_EMAIL_VERIFICATION_ENFORCED',
]

async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function parseEnvFile(fileContents) {
  const parsedEnvironment = {}

  for (const line of fileContents.split(/\r?\n/)) {
    const trimmedLine = line.trim()
    const separatorIndex = trimmedLine.indexOf('=')

    if (!trimmedLine || trimmedLine.startsWith('#') || separatorIndex <= 0) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    let value = trimmedLine.slice(separatorIndex + 1).trim()

    if (
      value.length >= 2 &&
      (value[0] === '"' || value[0] === "'") &&
      value.endsWith(value[0])
    ) {
      value = value.slice(1, -1)
    }

    parsedEnvironment[key] = value
  }

  return parsedEnvironment
}

async function loadEnvironment() {
  const hasEnvFile = await fileExists(envFilePath)
  const selectedPath = hasEnvFile ? envFilePath : envExampleFilePath

  if (!hasEnvFile) {
    process.stdout.write(
      'No .env found. Using .env.example defaults (copy it to .env to customize).\n',
    )
  }

  const parsed = parseEnvFile(await readFile(selectedPath, 'utf8'))

  return { ...parsed, ...process.env, DATABASE_URL: parsed.DATABASE_URL }
}

function runCommand(command, args, environment) {
  return new Promise(function executeCommand(resolve, reject) {
    const childProcess = spawn(command, args, {
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

      reject(
        new Error(`${command} ${args.join(' ')} exited with status ${code}`),
      )
    })
  })
}

function sleep(durationMs) {
  return new Promise(function wait(resolve) {
    setTimeout(resolve, durationMs)
  })
}

async function startDatabase(environment) {
  await runCommand(
    'docker',
    ['compose', '-f', composeFilePath, 'up', '-d', '--wait', 'postgres-dev'],
    environment,
  )
}

async function stopDatabase(environment) {
  await runCommand(
    'docker',
    ['compose', '-f', composeFilePath, 'down', '--remove-orphans'],
    environment,
  )
}

async function migrateDatabase(environment) {
  const maxAttempts = 10

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runCommand('pnpm', ['db:migrate'], environment)
      return
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error
      }

      process.stdout.write(
        `Waiting for dev database (attempt ${attempt}/${maxAttempts})...\n`,
      )
      await sleep(2000)
    }
  }
}

function requireEnvironmentValue(environment, name) {
  const value = environment[name]

  if (!value) {
    throw new Error(`Missing ${name}. Set it in .env (see .env.example).`)
  }

  return value
}

async function writeDevVars(environment) {
  const lines = backendSecretNames
    .filter(function isSet(name) {
      return Boolean(environment[name])
    })
    .map(function format(name) {
      return `${name}=${JSON.stringify(environment[name])}`
    })
  const contents = `${lines.join('\n')}\n`

  for (const directory of [backendDirectory, orchestratorDirectory]) {
    await writeFile(path.join(directory, '.dev.vars'), contents)
  }
}

async function writeOrchestratorDevConfig() {
  const sourcePath = path.join(orchestratorDirectory, 'wrangler.jsonc')
  const generatedName = 'wrangler.dev.generated.jsonc'
  const withoutComments = (await readFile(sourcePath, 'utf8')).replace(
    /^\s*\/\/.*$/gm,
    '',
  )
  const config = JSON.parse(withoutComments)

  delete config.ai

  await writeFile(
    path.join(orchestratorDirectory, generatedName),
    `${JSON.stringify(config, null, 2)}\n`,
  )

  return path.join(orchestratorDirectory, generatedName)
}

function spawnLongRunning(name, command, args, directory, environment) {
  const childProcess = spawn(command, args, {
    cwd: directory,
    env: environment,
    stdio: 'inherit',
    detached: true,
  })

  return { name, childProcess }
}

function signalGroup(childProcess, signal) {
  try {
    process.kill(-childProcess.pid, signal)
  } catch {
    childProcess.kill(signal)
  }
}

function terminate(childProcess) {
  return new Promise(function waitForTermination(resolve) {
    if (childProcess.exitCode !== null) {
      resolve()
      return
    }

    const timeout = setTimeout(function forceKill() {
      signalGroup(childProcess, 'SIGKILL')
      resolve()
    }, 5000)

    childProcess.once('exit', function onExit() {
      clearTimeout(timeout)
      resolve()
    })
    signalGroup(childProcess, 'SIGTERM')
  })
}

function requireLocalDatabaseUrl(environment) {
  const databaseUrl = requireEnvironmentValue(environment, 'DATABASE_URL')
  const { hostname } = new URL(databaseUrl)

  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) {
    throw new Error(
      `Refusing to run the dev stack against non-local database host "${hostname}". Point DATABASE_URL in .env at the local dev Postgres.`,
    )
  }

  return databaseUrl
}

async function up() {
  const environment = await loadEnvironment()
  const databaseUrl = requireLocalDatabaseUrl(environment)

  const workerEnvironment = {
    ...environment,
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: databaseUrl,
  }

  await writeDevVars(environment)
  const orchestratorConfigPath = await writeOrchestratorDevConfig()
  await startDatabase(environment)

  try {
    await migrateDatabase(environment)
  } catch (error) {
    await stopDatabase(environment)
    throw error
  }

  const processes = [
    spawnLongRunning(
      'workers',
      'pnpm',
      [
        'exec',
        'wrangler',
        'dev',
        '--port',
        '8787',
        '-c',
        'wrangler.jsonc',
        '-c',
        path.relative(backendDirectory, orchestratorConfigPath),
        '-c',
        path.relative(backendDirectory, path.join(matcherDirectory, 'wrangler.jsonc')),
        '--persist-to',
        path.join(rootDirectory, '.wrangler/state'),
      ],
      backendDirectory,
      workerEnvironment,
    ),
    spawnLongRunning(
      'frontend',
      'pnpm',
      ['run', 'dev'],
      frontendDirectory,
      environment,
    ),
  ]

  let shuttingDown = false

  async function shutdown() {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    await Promise.all(
      processes.map(function stop(entry) {
        return terminate(entry.childProcess)
      }),
    )
    await stopDatabase(environment)
  }

  function onSignal() {
    shutdown().then(
      function exitClean() {
        process.exit(0)
      },
      function exitFailed(error) {
        process.stderr.write(`Shutdown failed: ${String(error)}\n`)
        process.exit(1)
      },
    )
  }

  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  process.stdout.write(
    'Dev stack: frontend http://localhost:3000, backend http://localhost:8787. Ctrl+C stops everything.\n',
  )

  const exitedName = await Promise.race(
    processes.map(function waitForExit(entry) {
      return new Promise(function resolveName(resolve) {
        entry.childProcess.once('exit', function onExit() {
          resolve(entry.name)
        })
      })
    }),
  )

  if (!shuttingDown) {
    await shutdown()
    throw new Error(`${exitedName} exited unexpectedly.`)
  }
}

async function down() {
  await stopDatabase(await loadEnvironment())
}

async function reset() {
  const environment = await loadEnvironment()

  requireLocalDatabaseUrl(environment)

  await runCommand(
    'docker',
    ['compose', '-f', composeFilePath, 'down', '--volumes', '--remove-orphans'],
    environment,
  )
  await startDatabase(environment)
  await migrateDatabase(environment)
}

const commands = { up, down, reset }

async function main() {
  const command = process.argv[2] ?? 'up'
  const handler = commands[command]

  if (!handler) {
    process.stdout.write(
      'Usage: pnpm dev | pnpm dev:stack:down | pnpm dev:stack:reset\n  up     start Postgres, migrate, run workers and frontend (default)\n  down   stop local Postgres\n  reset  wipe and recreate the local database\n',
    )
    return
  }

  await handler()
}

main().catch(function handleError(error) {
  process.stderr.write(
    `Dev stack failed: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
})
