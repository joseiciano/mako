import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AppShellSmart } from './app-shell-smart'

vi.mock('@tanstack/react-router', function mockTanstackRouter() {
  return {
    useRouterState: function useRouterState() {
      return '/dashboard'
    },
  }
})

describe('app-shell-smart', function () {
  it('renders desktop sidebar, header controls, and content', function () {
    const html = renderToString(
      <AppShellSmart>
        <p>Shell content</p>
      </AppShellSmart>,
    )

    expect(html).toContain('Desktop navigation')
    expect(html).toContain('aria-label="Open navigation menu"')
    expect(html).toContain('aria-controls="mobile-navigation-drawer"')
    expect(html).toContain('Mako User')
    expect(html).toContain('Shell content')
    expect(html).toContain('href="/dashboard"')
    expect(html).toContain('href="/interviews"')
    expect(html).toContain('href="/billing"')
    expect(html).toContain('href="/settings"')
  })
})
