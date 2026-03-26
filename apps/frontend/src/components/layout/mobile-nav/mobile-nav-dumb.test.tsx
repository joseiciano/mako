import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CORE_NAV_ITEMS,
  isCoreNavigationItemActive,
} from '../navigation/nav-items'
import { MobileNavDumb } from './mobile-nav-dumb'

describe('mobile-nav-dumb', function () {
  it('does not render when closed', function () {
    const html = renderToString(
      <MobileNavDumb
        isOpen={false}
        navigationItems={CORE_NAV_ITEMS}
        pathname="/dashboard"
        isItemActive={isCoreNavigationItemActive}
        onClose={function onClose() {}}
      />,
    )

    expect(html).toBe('')
  })

  it('renders an accessible drawer with navigation links when open', function () {
    const html = renderToString(
      <MobileNavDumb
        isOpen
        title="Dashboard"
        navigationItems={CORE_NAV_ITEMS}
        pathname="/dashboard"
        isItemActive={isCoreNavigationItemActive}
        onClose={function onClose() {}}
      />,
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Mobile navigation menu"')
    expect(html).toContain('aria-label="Close navigation menu"')
    expect(html).toContain('aria-label="Close menu"')
    expect(html).toContain('Dashboard')

    for (const item of CORE_NAV_ITEMS) {
      expect(html).toContain(item.label)
      expect(html).toContain(`href="${item.href}"`)
    }
  })
})
