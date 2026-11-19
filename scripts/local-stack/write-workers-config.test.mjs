import { describe, expect, it } from 'vitest'
import { buildBackendConfig, buildOrchestratorConfig } from './write-workers-config.mjs'

describe('buildOrchestratorConfig', function describeOrchestrator() {
  it('drops the ai binding and keeps the rest', function dropsAi() {
    const result = buildOrchestratorConfig({ name: 'o', ai: { binding: 'AI' }, triggers: { crons: ['*/5 * * * *'] } })

    expect(result).toEqual({ name: 'o', triggers: { crons: ['*/5 * * * *'] } })
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
