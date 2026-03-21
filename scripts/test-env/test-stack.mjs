import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const currentFile = fileURLToPath(import.meta.url)
const currentDirectory = path.dirname(currentFile)
const rootDirectory = path.resolve(currentDirectory, '../..')
const dockerComposeFilePath = path.join(rootDirectory, 'docker-compose.test.yml')
const envFilePath = path.join(rootDirectory, '.env.test')
const envExampleFilePath = path.join(rootDirectory, '.env.test.example')

function parseCommand() {
  return process.argv[2] ?? 'help'
}

async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function normalizeEnvValue(value) {
  const trimmedValue = value.trim()

  const isQuoted =
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))

  if (!isQuoted) {
    return trimmedValue
  }

  return trimmedValue.slice(1, -1)
}

function parseEnvFile(fileContents) {
  const parsedEnvironment = {}
  const lines = fileContents.split(/\r?\n/)

  for (const line of lines) {
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf('=')

    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    const value = normalizeEnvValue(trimmedLine.slice(separatorIndex + 1))

    if (!key) {
      continue
    }

    parsedEnvironment[key] = value
  }

  return parsedEnvironment
}

async function loadTestEnvironment() {
  const selectedEnvFilePath = (await fileExists(envFilePath))
    ? envFilePath
    : envExampleFilePath

  if (!(await fileExists(selectedEnvFilePath))) {
    throw new Error(
      'Missing .env.test and .env.test.example. Add .env.test.example to continue.',
    )
  }

  const fileContents = await readFile(selectedEnvFilePath, 'utf8')
  const parsedEnvironment = parseEnvFile(fileContents)

  return {
    ...process.env,
    ...parsedEnvironment,
  }
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
        new Error(
          `${command} ${args.join(' ')} exited with status ${String(code)}`,
        ),
      )
    })
  })
}

function spawnCommand(command, args, environment) {
  return spawn(command, args, {
    cwd: rootDirectory,
    env: environment,
    stdio: 'inherit',
  })
}

function sleep(durationMs) {
  return new Promise(function wait(resolve) {
    setTimeout(resolve, durationMs)
  })
}

function waitForExit(childProcess, processName) {
  return new Promise(function waitForProcess(resolve, reject) {
    childProcess.on('error', reject)
    childProcess.on('exit', function handleExit(code, signal) {
      if (code === 0 || signal === 'SIGINT' || signal === 'SIGTERM') {
        resolve()
        return
      }

      reject(
        new Error(
          `${processName} exited unexpectedly (code=${String(code)}, signal=${String(signal)})`,
        ),
      )
    })
  })
}

async function terminateProcess(childProcess) {
  if (!childProcess || childProcess.exitCode !== null) {
    return
  }

  childProcess.kill('SIGTERM')

  await new Promise(function waitForTermination(resolve) {
    const timeout = setTimeout(function forceKill() {
      if (childProcess.exitCode === null) {
        childProcess.kill('SIGKILL')
      }

      resolve()
    }, 5000)

    childProcess.once('exit', function onExit() {
      clearTimeout(timeout)
      resolve()
    })
  })
}

async function startDatabase(environment) {
  await runCommand(
    'docker',
    ['compose', '-f', dockerComposeFilePath, 'up', '-d', 'postgres-test'],
    environment,
  )
}

async function stopDatabase(environment) {
  await runCommand(
    'docker',
    ['compose', '-f', dockerComposeFilePath, 'down', '--remove-orphans'],
    environment,
  )
}

async function resetDatabase(environment) {
  await runCommand('pnpm', ['db:test:reset'], environment)
}

async function resetDatabaseWithRetries(environment) {
  const maxAttempts = 12

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await resetDatabase(environment)
      return
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error
      }

      process.stdout.write(
        `Waiting for test database readiness (attempt ${attempt}/${maxAttempts})...\n`,
      )

      await sleep(2000)
    }
  }
}

async function upStack(environment) {
  await startDatabase(environment)
  await resetDatabaseWithRetries(environment)

  const backendProcess = spawnCommand(
    'pnpm',
    ['--filter', '@mako/backend-rest', 'run', 'dev'],
    environment,
  )

  const frontendProcess = spawnCommand(
    'pnpm',
    ['--filter', '@mako/frontend', 'run', 'dev'],
    environment,
  )

  let shuttingDown = false

  async function shutdown() {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    await terminateProcess(backendProcess)
    await terminateProcess(frontendProcess)
    await stopDatabase(environment)
  }

  function onSignal() {
    void shutdown().finally(function exitProcess() {
      process.exit(0)
    })
  }

  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  process.stdout.write(
    'Local test stack is running. Press Ctrl+C to stop and clean up.\n',
  )

  try {
    await Promise.race([
      waitForExit(backendProcess, 'backend-rest'),
      waitForExit(frontendProcess, 'frontend'),
    ])

    if (!shuttingDown) {
      throw new Error('One of the local stack processes exited unexpectedly.')
    }
  } finally {
    await shutdown()
  }
}

async function downStack(environment) {
  await stopDatabase(environment)
}

async function resetStack(environment) {
  try {
    await stopDatabase(environment)
  } catch {
    process.stdout.write('No existing docker test stack to tear down.\n')
  }

  await startDatabase(environment)
  await resetDatabaseWithRetries(environment)
}

function printUsage() {
  process.stdout.write(
    [
      'Usage: pnpm test:stack <command>',
      '',
      'Commands:',
      '  up     Start local test stack (db + backend + frontend)',
      '  down   Stop local test stack resources',
      '  reset  Recreate local test database from a clean state',
      '',
    ].join('\n'),
  )
}

async function main() {
  const command = parseCommand()

  if (!['up', 'down', 'reset'].includes(command)) {
    printUsage()
    return
  }

  const environment = await loadTestEnvironment()

  if (command === 'up') {
    await upStack(environment)
    return
  }

  if (command === 'down') {
    await downStack(environment)
    return
  }

  await resetStack(environment)
}

main().catch(function handleError(error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Test stack command failed: ${message}\n`)
  process.exitCode = 1
})
