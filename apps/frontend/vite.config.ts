import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

const backendApiOrigin =
  process.env.MAKO_BACKEND_API_ORIGIN ?? 'http://127.0.0.1:8787'

const config = defineConfig({
  server: {
    proxy: {
      '/api': {
        target: backendApiOrigin,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
})

export default config
