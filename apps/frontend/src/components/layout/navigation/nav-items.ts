export type NavigationItem = {
  label: string
  href: `/${string}`
}

export const CORE_NAV_ITEMS: readonly NavigationItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
  },
  {
    label: 'Interviews',
    href: '/interviews',
  },
  {
    label: 'Billing',
    href: '/billing',
  },
  {
    label: 'Settings',
    href: '/settings',
  },
]

export const ADMIN_NAV_ITEM: NavigationItem = {
  label: 'Admin',
  href: '/admin/reviews',
}

// The admin entry is only present for admins; non-admins never see the route.
export function getNavigationItems(isAdmin: boolean): readonly NavigationItem[] {
  return isAdmin ? [...CORE_NAV_ITEMS, ADMIN_NAV_ITEM] : CORE_NAV_ITEMS
}

export function isCoreNavigationItemActive(pathname: string, href: string) {
  if (pathname === '/' && href === '/dashboard') {
    return true
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}
