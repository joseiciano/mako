import { describe, expect, it } from 'vitest'
import { getNavigationItems } from './nav-items'

describe('getNavigationItems', function suite() {
  it('adds the admin entry for admins', function run() {
    const items = getNavigationItems(true)

    expect(items[items.length - 1]).toEqual({ label: 'Admin', href: '/admin/reviews' })
  })

  it('omits the admin route entirely for non-admins', function run() {
    const hrefs = getNavigationItems(false).map(function href(item) {
      return item.href
    })

    expect(hrefs).not.toContain('/admin/reviews')
    expect(hrefs).toEqual(['/dashboard', '/interviews', '/billing', '/settings'])
  })
})
