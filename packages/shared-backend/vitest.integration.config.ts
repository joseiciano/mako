import { defineConfig, mergeConfig } from 'vitest/config'
import sharedConfig from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: '@mako/shared-backend-integration',
      include: [
        'src/auth/auth-config.integration.test.ts',
        'src/auth/rate-limit-schema-readiness.integration.test.ts',
      ],
    },
  }),
)
