import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShellDumb } from './app-shell-dumb'

describe('AppShellDumb', function () {
  it('renders user menu with a sign out action', function () {
    const html = renderToString(
      <AppShellDumb
        pageTitle="Dashboard"
        userName="jose@example.com"
        isSigningOut={false}
        onSignOut={function noop() {
          return undefined
        }}
      >
        <p>Content</p>
      </AppShellDumb>,
    )

    expect(html).toContain('Application Shell')
    expect(html).toContain('jose@example.com')
    expect(html).toContain('Sign out')
  })
})
