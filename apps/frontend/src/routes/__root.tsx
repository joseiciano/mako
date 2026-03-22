import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { AppShell } from '#/components/layout/app-shell'
import { QueryClientProvider } from '@tanstack/react-query'

import appCss from '../styles.css?url'
import { getQueryClient } from '../lib/query-client'

export const rootRoute = createRootRoute({
  head: function head() {
    return {
      meta: [
        {
          charSet: 'utf-8',
        },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1',
        },
        {
          title: 'Mako Frontend',
        },
      ],
      links: [
        {
          rel: 'stylesheet',
          href: appCss,
        },
      ],
    }
  },
  component: RootDocument,
})

export const Route = rootRoute

function RootDocument() {
  const queryClient = getQueryClient()

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased">
        <QueryClientProvider client={queryClient}>
          <AppShell>
            <Outlet />
          </AppShell>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
