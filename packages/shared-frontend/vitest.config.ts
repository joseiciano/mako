import { defineConfig, mergeConfig } from 'vitest/config'
import sharedConfig from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: '@mako/shared-frontend',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  }),
)
