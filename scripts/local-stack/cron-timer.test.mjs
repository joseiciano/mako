import { describe, expect, it, vi } from 'vitest'
import { cronBindings, cronTargets } from './cron-targets.mjs'
import { createCronTimer } from './cron-timer.mjs'

function createHarness(fetchImpl) {
  const scheduled = []
  const log = vi.fn()
  const timer = createCronTimer({
    baseUrl: 'http://workers:8787',
    fetchImpl,
    log,
    setIntervalImpl: function fakeSetInterval(callback, intervalMs) {
      scheduled.push({ callback, intervalMs })
      return scheduled.length
    },
    clearIntervalImpl: vi.fn(),
  })

  return { scheduled, log, timer }
}

describe('cron targets', function describeTargets() {
  it('matches the configured cron cadence', function checkCadence() {
    expect(cronTargets).toEqual([
      { name: 'orchestrator', intervalMs: 300000 },
      { name: 'matcher', intervalMs: 600000 },
    ])
  })

  it('has a service binding for every target', function checkBindings() {
    for (const target of cronTargets) {
      expect(cronBindings[target.name]).toBeDefined()
    }
  })
})

describe('createCronTimer', function describeTimer() {
  it('schedules one interval per target', function checkSchedule() {
    const { scheduled, timer } = createHarness(vi.fn())

    timer.start()

    expect(scheduled.map((entry) => entry.intervalMs)).toEqual([300000, 600000])
  })

  it('posts to the matching bridge path when an interval fires', async function checkPost() {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200 })
    const { scheduled, log, timer } = createHarness(fetchImpl)

    timer.start()
    await scheduled[0].callback()
    await scheduled[1].callback()

    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'http://workers:8787/__local/cron/orchestrator', { method: 'POST' })
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'http://workers:8787/__local/cron/matcher', { method: 'POST' })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('orchestrator scheduled handler -> HTTP 200'))
  })

  it('logs a failure and keeps running when the call rejects', async function checkFailure() {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('refused'))
    const { scheduled, log, timer } = createHarness(fetchImpl)

    timer.start()
    await expect(scheduled[0].callback()).resolves.toBeUndefined()

    expect(log).toHaveBeenCalledWith(expect.stringContaining('failed'))
  })

  it('clears every interval on stop', function checkStop() {
    const clearIntervalImpl = vi.fn()
    const timer = createCronTimer({
      baseUrl: 'http://x',
      setIntervalImpl: (_callback, intervalMs) => intervalMs,
      clearIntervalImpl,
    })

    timer.start()
    timer.stop()

    expect(clearIntervalImpl.mock.calls.map((call) => call[0])).toEqual([300000, 600000])
  })
})
