import react from '@vitejs/plugin-react'
import { defineConfig, mergeConfig } from 'vitest/config'
import sharedConfig from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    plugins: [react()],
    test: {
      name: '@mako/frontend',
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  }),
)
