import { describe, expect, it } from 'vitest'
import { buildBackendConfig, buildFakeAiWorkerConfig, buildOrchestratorConfig } from './write-workers-config.mjs'

describe('buildOrchestratorConfig', function describeOrchestrator() {
  it('drops the ai binding and keeps the rest', function dropsAi() {
    const result = buildOrchestratorConfig({ name: 'o', ai: { binding: 'AI' }, triggers: { crons: ['*/5 * * * *'] } })

    expect(result).toEqual({ name: 'o', triggers: { crons: ['*/5 * * * *'] } })
  })
})

describe('CLOUDFLARE_API_BASE_URL var', function describeBaseUrl() {
  const source = { name: 'b', vars: { A: '1' } }

  it('is added to both configs when set, keeping other vars', function addsVar() {
    const environment = { CLOUDFLARE_API_BASE_URL: 'http://fakes:8790/client/v4' }

    for (const build of [buildBackendConfig, buildOrchestratorConfig]) {
      expect(build(source, environment).vars).toEqual({
        A: '1',
        CLOUDFLARE_API_BASE_URL: 'http://fakes:8790/client/v4',
      })
    }
  })

  it('leaves vars untouched when unset or blank', function skipsVar() {
    for (const environment of [{}, { CLOUDFLARE_API_BASE_URL: '' }, { CLOUDFLARE_API_BASE_URL: '  ' }]) {
      expect(buildBackendConfig(source, environment).vars).toEqual({ A: '1' })
      expect(buildOrchestratorConfig(source, environment).vars).toEqual({ A: '1' })
    }
  })
})

describe('STRIPE_API_BASE_URL var', function describeStripeBaseUrl() {
  const source = { name: 'b', vars: { A: '1' } }

  it('is added to the backend config only when set', function addsVar() {
    const environment = { STRIPE_API_BASE_URL: 'http://stripe-mock:12111' }

    expect(buildBackendConfig(source, environment).vars).toEqual({
      A: '1',
      STRIPE_API_BASE_URL: 'http://stripe-mock:12111',
    })
    expect(buildOrchestratorConfig(source, environment).vars).toEqual({ A: '1' })
  })

  it('also writes the Stripe keys as vars when set, since they are not required secrets', function addsKeys() {
    const environment = {
      STRIPE_API_BASE_URL: 'http://stripe-mock:12111',
      STRIPE_SECRET_KEY: 'sk_test_placeholder',
      STRIPE_WEBHOOK_SECRET: 'whsec_placeholder',
    }

    expect(buildBackendConfig(source, environment).vars).toEqual({
      A: '1',
      STRIPE_API_BASE_URL: 'http://stripe-mock:12111',
      STRIPE_SECRET_KEY: 'sk_test_placeholder',
      STRIPE_WEBHOOK_SECRET: 'whsec_placeholder',
    })
  })

  it('leaves vars untouched when unset or blank, even if Stripe keys exist', function skipsVar() {
    for (const environment of [
      {},
      { STRIPE_API_BASE_URL: '' },
      { STRIPE_API_BASE_URL: '  ', STRIPE_SECRET_KEY: 'sk_test_placeholder' },
    ]) {
      expect(buildBackendConfig(source, environment).vars).toEqual({ A: '1' })
    }
  })
})

describe('buildBackendConfig', function describeBackend() {
  const source = { name: 'b', main: 'src/index.ts', compatibility_flags: ['nodejs_compat'], hyperdrive: [{ binding: 'HYPERDRIVE' }] }

  it('points main at the cron bridge and keeps other settings', function pointsMain() {
    const result = buildBackendConfig(source)

    expect(result.main).toBe('../../docker/local/cron-bridge-entry.mjs')
    expect(result.hyperdrive).toEqual(source.hyperdrive)
    expect(result.compatibility_flags).toEqual(['nodejs_compat', 'service_binding_extra_handlers'])
  })

  it('binds the orchestrator and matcher services', function bindsServices() {
    const services = buildBackendConfig(source).services.map((entry) => entry.service)

    expect(services).toEqual(['mako-notification-orchestrator', 'mako-greedy-matcher'])
  })

  it('does not mutate the source config', function noMutation() {
    buildBackendConfig(source)

    expect(source.main).toBe('src/index.ts')
  })
})

describe('fake AI wiring when fakes are on', function describeFakeAi() {
  const environment = { LOCAL_FAKES_ENABLED: '1', CLOUDFLARE_API_BASE_URL: 'http://fakes:8790/client/v4' }
  const source = { name: 'o', compatibility_date: '2026-03-15', ai: { binding: 'AI' }, services: [{ binding: 'X', service: 'x' }] }

  it('binds the fake worker as AI and keeps other services', function bindsAi() {
    const result = buildOrchestratorConfig(source, environment)

    expect(result.ai).toBeUndefined()
    expect(result.services).toEqual([
      { binding: 'X', service: 'x' },
      { binding: 'AI', service: 'mako-fake-ai', entrypoint: 'FakeAi' },
    ])
  })

  it('sets a gateway URL whose last segment is the gateway id, on both configs', function setsGateway() {
    for (const result of [buildOrchestratorConfig(source, environment), buildBackendConfig(source, environment)]) {
      expect(result.vars.AI_GATEWAY_BASE_URL).toBe('http://fakes:8790/client/v4/local-fake-gateway')
    }
  })

  it('leaves backend credentials to its required secrets', function backendNoCredentials() {
    expect(buildBackendConfig(source, environment).vars).not.toHaveProperty('CLOUDFLARE_ACCOUNT_ID')
  })

  it('gives the orchestrator placeholder credentials without overriding existing vars', function setsCredentials() {
    const result = buildOrchestratorConfig({ ...source, vars: { CLOUDFLARE_ACCOUNT_ID: 'real' } }, environment)

    expect(result.vars.CLOUDFLARE_ACCOUNT_ID).toBe('real')
    expect(result.vars.CLOUDFLARE_API_TOKEN).toBe('local-placeholder')
  })

  it('builds a fake worker config using the orchestrator compatibility date', function fakeWorker() {
    expect(buildFakeAiWorkerConfig(source)).toEqual({
      name: 'mako-fake-ai',
      main: 'src/ai-binding-worker.ts',
      compatibility_date: '2026-03-15',
    })
  })
})

describe('fake RealtimeKit recording wiring', function describeFakeRecording() {
  const environment = { LOCAL_FAKES_ENABLED: '1', CLOUDFLARE_API_BASE_URL: 'http://fakes:8790/client/v4' }

  it('points the backend webhook key URL at the fakes service', function pointsKeyUrl() {
    const result = buildBackendConfig({ name: 'b', vars: { REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: 'https://prod' } }, environment)

    expect(result.vars.REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL).toBe('http://fakes:8790/realtimekit/.well-known/webhooks.json')
  })

  it('runs the orchestrator through the fake download entry with the fakes origin and a placeholder app id', function rewritesDownloads() {
    const result = buildOrchestratorConfig({ name: 'o', main: 'src/index.ts' }, environment)

    expect(result.main).toBe('../../docker/local/orchestrator-fakes-entry.mjs')
    expect(result.define).toEqual({ FAKES_DOWNLOAD_TARGET: '"http://fakes:8790"' })
    expect(result.vars.CLOUDFLARE_REALTIMEKIT_APP_ID).toBe('local-placeholder')
  })

  it('changes nothing when fakes are off or the API base URL is blank', function offUnchanged() {
    for (const off of [{}, { CLOUDFLARE_API_BASE_URL: 'http://fakes:8790/client/v4' }, { LOCAL_FAKES_ENABLED: '1' }]) {
      expect(buildBackendConfig({ name: 'b' }, off).vars?.REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL).toBeUndefined()
      expect(buildOrchestratorConfig({ name: 'o', main: 'src/index.ts' }, off).main).toBe('src/index.ts')
    }
  })
})

describe('fake AI wiring when fakes are off', function describeFakeAiOff() {
  const source = { name: 'o', ai: { binding: 'AI' } }

  it('adds no service or gateway var', function addsNothing() {
    for (const environment of [{}, { LOCAL_FAKES_ENABLED: '' }]) {
      const result = buildOrchestratorConfig(source, environment)

      expect(result).toEqual({ name: 'o' })
      expect(buildBackendConfig({ name: 'b' }, environment).vars).toBeUndefined()
    }
  })
})
