import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { AppShell } from '#/components/layout/app-shell'

import appCss from '../styles.css?url'

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
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased">
        <AppShell>
          <Outlet />
        </AppShell>
        <Scripts />
      </body>
    </html>
  )
}
