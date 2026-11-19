import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cronPathFor, cronTargets } from './cron-targets.mjs'

export function createCronTimer({
  targets = cronTargets,
  baseUrl,
  fetchImpl = fetch,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  log = console.log,
}) {
  let handles = []
  const running = new Set()

  async function fire(target) {
    if (running.has(target.name)) {
      log(`[cron-timer] ${target.name} previous run still pending, skipping tick`)
      return
    }

    running.add(target.name)

    const url = `${baseUrl}${cronPathFor(target.name)}`

    try {
      const response = await fetchImpl(url, { method: 'POST' })

      log(`[cron-timer] ${target.name} scheduled handler -> HTTP ${response.status}`)
    } catch (error) {
      log(`[cron-timer] ${target.name} scheduled handler failed: ${String(error)}`)
    } finally {
      running.delete(target.name)
    }
  }

  function start() {
    handles = targets.map(function schedule(target) {
      return setIntervalImpl(function tick() {
        return fire(target)
      }, target.intervalMs)
    })
  }

  function stop() {
    for (const handle of handles) {
      clearIntervalImpl(handle)
    }

    handles = []
  }

  return { start, stop, fire }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const baseUrl = process.env.WORKERS_BASE_URL ?? 'http://127.0.0.1:8787'

  createCronTimer({ baseUrl }).start()
  console.log(`[cron-timer] started against ${baseUrl}`)
}
