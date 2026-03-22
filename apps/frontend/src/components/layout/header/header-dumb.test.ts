import { describe, expect, it } from 'vitest'
import { formatPathSegment, getRouteHeaderContent } from './header-dumb'

describe('header dumb helpers', function () {
  it('formats route path segments into readable labels', function () {
    expect(formatPathSegment('system-design')).toBe('System Design')
  })

  it('returns a title-only state for top-level routes', function () {
    expect(getRouteHeaderContent('/dashboard')).toEqual({
      title: 'Dashboard',
      breadcrumbs: [],
    })
  })

  it('returns breadcrumb state for nested routes', function () {
    expect(getRouteHeaderContent('/settings/profile')).toEqual({
      title: 'Profile',
      breadcrumbs: [
        {
          href: '/settings',
          label: 'Settings',
        },
        {
          href: '/settings/profile',
          label: 'Profile',
        },
      ],
    })
  })
})
