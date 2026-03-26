import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HeaderDumb } from '#/components/layout/header'
import { AppShellDumb } from './app-shell-dumb'

describe('app shell dumb component', function () {
  it('renders header navigation and page content', function () {
    const html = renderToString(
      <AppShellDumb
        header={
          <HeaderDumb
            navigation={<nav>Primary Navigation</nav>}
            title="Dashboard"
            breadcrumbs={[]}
            userName="Mako User"
          />
        }
      >
        <section>Route Content</section>
      </AppShellDumb>,
    )

    expect(html).toContain('Primary Navigation')
    expect(html).toContain('Route Content')
    expect(html).toContain('Dashboard')
    expect(html).toContain('Logout')
  })

  it('renders breadcrumbs when available', function () {
    const html = renderToString(
      <AppShellDumb
        header={
          <HeaderDumb
            navigation={<nav>Primary Navigation</nav>}
            title="Billing"
            breadcrumbs={[
              { href: '/settings', label: 'Settings' },
              { href: '/billing', label: 'Billing' },
            ]}
            userName="Mako User"
          />
        }
      >
        <section>Route Content</section>
      </AppShellDumb>,
    )

    expect(html).toContain('Settings')
    expect(html).toContain('Billing')
  })
})
