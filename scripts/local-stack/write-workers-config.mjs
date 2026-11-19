import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { readJsoncConfig } from '../dev/orchestrator-dev-config.mjs'
import { cronBindings } from './cron-targets.mjs'

export const generatedConfigName = 'wrangler.dev.generated.jsonc'
const bridgeEntryFromBackend = '../../docker/local/cron-bridge-entry.mjs'

export function buildOrchestratorConfig(config) {
  const { ai: _ai, ...rest } = config

  return rest
}

export function buildBackendConfig(config) {
  return {
    ...config,
    main: bridgeEntryFromBackend,
    compatibility_flags: [
      ...new Set([...(config.compatibility_flags ?? []), 'service_binding_extra_handlers']),
    ],
    services: [
      ...(config.services ?? []),
      ...Object.values(cronBindings),
    ],
  }
}

export async function writeWorkersConfigs(rootDirectory) {
  const backendDirectory = path.join(rootDirectory, 'apps/backend-rest')
  const orchestratorDirectory = path.join(rootDirectory, 'apps/notification-orchestrator')
  const backendConfig = buildBackendConfig(
    await readJsoncConfig(path.join(backendDirectory, 'wrangler.jsonc')),
  )
  const orchestratorConfig = buildOrchestratorConfig(
    await readJsoncConfig(path.join(orchestratorDirectory, 'wrangler.jsonc')),
  )

  await writeFile(
    path.join(backendDirectory, generatedConfigName),
    `${JSON.stringify(backendConfig, null, 2)}\n`,
  )
  await writeFile(
    path.join(orchestratorDirectory, generatedConfigName),
    `${JSON.stringify(orchestratorConfig, null, 2)}\n`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

  await writeWorkersConfigs(rootDirectory)
}
