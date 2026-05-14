import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { getQueryClient } from './lib/query-client'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = getQueryClient()
  const router = createTanStackRouter({
    context: {
      queryClient,
    },
    routeTree,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
