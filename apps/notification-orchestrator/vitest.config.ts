import { defineConfig, mergeConfig } from 'vitest/config'
import sharedConfig from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: '@mako/notification-orchestrator',
      include: ['src/**/*.test.ts'],
    },
    resolve: {
      alias: {
        'cloudflare:workers': new URL('./src/mocks/cloudflare-workers.ts', import.meta.url).pathname,
        'cloudflare:workflows': new URL('./src/mocks/cloudflare-workflows.ts', import.meta.url).pathname,
      },
    },
  }),
)
