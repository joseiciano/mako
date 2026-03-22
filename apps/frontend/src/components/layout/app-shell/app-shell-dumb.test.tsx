import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShellDumb } from './app-shell-dumb'

describe('app shell dumb component', function () {
  it('renders sidebar, header, and page content', function () {
    const html = renderToString(
      <AppShellDumb
        navigation={<nav>Primary Navigation</nav>}
        title="Dashboard"
        breadcrumbs={[]}
        userName="Mako User"
        isSidebarCollapsed={false}
        onSidebarToggle={function noop() {}}
      >
        <section>Route Content</section>
      </AppShellDumb>,
    )

    expect(html).toContain('Primary Navigation')
    expect(html).toContain('Route Content')
    expect(html).toContain('Dashboard')
    expect(html).toContain('Mako')
    expect(html).toContain('Logout')
  })

  it('uses compact shell spacing when sidebar is collapsed', function () {
    const html = renderToString(
      <AppShellDumb
        navigation={<nav>Primary Navigation</nav>}
        title="Dashboard"
        breadcrumbs={[]}
        userName="Mako User"
        isSidebarCollapsed
        onSidebarToggle={function noop() {}}
      >
        <section>Route Content</section>
      </AppShellDumb>,
    )

    expect(html).toContain('lg:pl-20')
  })
})
