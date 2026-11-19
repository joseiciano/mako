import worker from '../../apps/notification-orchestrator/src/index.ts'

export * from '../../apps/notification-orchestrator/src/index.ts'
export default worker

// FAKES_DOWNLOAD_TARGET is replaced at build time by `define` in the generated config.
const fakeDownloadOrigin = 'https://fakes.invalid'
const realFetch = globalThis.fetch

globalThis.fetch = function fetchWithFakeDownloads(input, init) {
  const url = new URL(input instanceof Request ? input.url : String(input))

  if (url.origin !== fakeDownloadOrigin) {
    return realFetch(input, init)
  }

  return realFetch(`${FAKES_DOWNLOAD_TARGET}${url.pathname}${url.search}`, init)
}
