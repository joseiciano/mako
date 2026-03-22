import { describe, expect, it } from 'vitest'
import {
  createNavigationItems,
  isNavigationItemActive,
} from './navigation-smart'

describe('navigation smart logic', function () {
  it('marks direct route matches as active', function () {
    expect(isNavigationItemActive('/dashboard', '/dashboard')).toBe(true)
    expect(isNavigationItemActive('/', '/dashboard')).toBe(true)
    expect(isNavigationItemActive('/dashboard', '/billing')).toBe(false)
  })

  it('marks nested routes as active', function () {
    expect(isNavigationItemActive('/settings/profile', '/settings')).toBe(true)
    expect(isNavigationItemActive('/interviews/123', '/interviews')).toBe(true)
  })

  it('creates core navigation items with active state', function () {
    const items = createNavigationItems('/billing')

    expect(items.map(function mapItem(item) { return item.label })).toEqual([
      'Dashboard',
      'Interviews',
      'Billing',
      'Settings',
    ])

    const activeItems = items.filter(function filterActiveItems(item) {
      return item.isActive
    })

    expect(activeItems).toHaveLength(1)
    expect(activeItems[0]).toMatchObject({
      href: '/billing',
      isActive: true,
    })
  })
})
