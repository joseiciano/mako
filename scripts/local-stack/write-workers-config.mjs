import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { readJsoncConfig } from '../dev/orchestrator-dev-config.mjs'
import { cronBindings } from './cron-targets.mjs'

export const generatedConfigName = 'wrangler.dev.generated.jsonc'
export const fakeAiWorkerName = 'mako-fake-ai'
const fakeGatewayId = 'local-fake-gateway'
const localPlaceholder = 'local-placeholder'
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

/**
 * Same as withApiBaseUrl, for the optional Stripe API base URL (local
 * stripe-mock). The Stripe keys are not `secrets.required` names, so wrangler
 * dev would not load them from the process env; with the base URL set they are
 * written as vars too (local placeholder values from the compose env).
 */
function withStripeApiBaseUrl(config, environment) {
  const baseUrl = environment.STRIPE_API_BASE_URL?.trim()

  if (!baseUrl) {
    return config
  }

  const keyVars = Object.fromEntries(
    ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']
      .filter((name) => environment[name]?.trim())
      .map((name) => [name, environment[name].trim()]),
  )

  return { ...config, vars: { ...config.vars, ...keyVars, STRIPE_API_BASE_URL: baseUrl } }
}

function fakesOn(environment) {
  return environment.LOCAL_FAKES_ENABLED === '1'
}

/**
 * With fakes on, AI Gateway calls go to the fakes service: the gateway id is
 * the last segment of this URL, so a non-empty value turns the gateway path on.
 * The backend already receives its credentials as required secrets; the
 * orchestrator has none, so it gets placeholders as vars.
 */
function withFakeGateway(config, environment, credentialVars = {}) {
  const baseUrl = environment.CLOUDFLARE_API_BASE_URL?.trim()

  if (!fakesOn(environment) || !baseUrl) {
    return config
  }

  return {
    ...config,
    vars: {
      ...credentialVars,
      ...config.vars,
      AI_GATEWAY_BASE_URL: `${baseUrl}/${fakeGatewayId}`,
    },
  }
}

export function buildOrchestratorConfig(config, environment = {}) {
  const { ai: _ai, ...rest } = config

  if (!fakesOn(environment)) {
    return withApiBaseUrl(rest, environment)
  }

  return withFakeGateway(withApiBaseUrl({
    ...rest,
    services: [
      ...(rest.services ?? []),
      { binding: 'AI', service: fakeAiWorkerName, entrypoint: 'FakeAi' },
    ],
  }, environment), environment, {
    CLOUDFLARE_ACCOUNT_ID: localPlaceholder,
    CLOUDFLARE_API_TOKEN: localPlaceholder,
  })
}

export function buildFakeAiWorkerConfig(orchestratorConfig) {
  return {
    name: fakeAiWorkerName,
    main: 'src/ai-binding-worker.ts',
    compatibility_date: orchestratorConfig.compatibility_date,
  }
}

export function buildBackendConfig(config, environment = {}) {
  return withFakeGateway(withStripeApiBaseUrl(withApiBaseUrl({
    ...config,
    main: bridgeEntryFromBackend,
    compatibility_flags: [
      ...new Set([...(config.compatibility_flags ?? []), 'service_binding_extra_handlers']),
    ],
    services: [
      ...(config.services ?? []),
      ...Object.values(cronBindings),
    ],
  }, environment), environment), environment)
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

  if (fakesOn(process.env)) {
    await writeFile(
      path.join(rootDirectory, 'apps/fakes', generatedConfigName),
      `${JSON.stringify(buildFakeAiWorkerConfig(orchestratorConfig), null, 2)}\n`,
    )
  }

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
