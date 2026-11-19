import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { readJsoncConfig } from '../dev/orchestrator-dev-config.mjs'
import { cronBindings } from './cron-targets.mjs'

export const generatedConfigName = 'wrangler.dev.generated.jsonc'
const bridgeEntryFromBackend = '../../docker/local/cron-bridge-entry.mjs'

/**
 * wrangler dev only loads names listed under `secrets.required` from the
 * process environment, so the optional API base URL is written as a var.
 * Unset or blank leaves the vars untouched.
 */
function withApiBaseUrl(config, environment) {
  const baseUrl = environment.CLOUDFLARE_API_BASE_URL?.trim()

  if (!baseUrl) {
    return config
  }

  return { ...config, vars: { ...config.vars, CLOUDFLARE_API_BASE_URL: baseUrl } }
}

export function buildOrchestratorConfig(config, environment = {}) {
  const { ai: _ai, ...rest } = config

  return withApiBaseUrl(rest, environment)
}

export function buildBackendConfig(config, environment = {}) {
  return withApiBaseUrl({
    ...config,
    main: bridgeEntryFromBackend,
    compatibility_flags: [
      ...new Set([...(config.compatibility_flags ?? []), 'service_binding_extra_handlers']),
    ],
    services: [
      ...(config.services ?? []),
      ...Object.values(cronBindings),
    ],
  }, environment)
}

export async function writeWorkersConfigs(rootDirectory) {
  const backendDirectory = path.join(rootDirectory, 'apps/backend-rest')
  const orchestratorDirectory = path.join(rootDirectory, 'apps/notification-orchestrator')
  const backendConfig = buildBackendConfig(
    await readJsoncConfig(path.join(backendDirectory, 'wrangler.jsonc')),
    process.env,
  )
  const orchestratorConfig = buildOrchestratorConfig(
    await readJsoncConfig(path.join(orchestratorDirectory, 'wrangler.jsonc')),
    process.env,
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
