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

export function isCoreNavigationItemActive(pathname: string, href: string) {
  if (pathname === '/' && href === '/dashboard') {
    return true
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}
