import { describe, expect, it } from 'vitest'
import { buildBackendConfig, buildOrchestratorConfig } from './write-workers-config.mjs'

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
