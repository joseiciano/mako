import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  Settings2,
} from 'lucide-react'
import { useRouterState } from '@tanstack/react-router'
import { NavigationDumb, type NavigationDumbItem } from './navigation-dumb'

type NavigationDefinition = Omit<NavigationDumbItem, 'isActive'>

const navigationDefinitions: NavigationDefinition[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/interviews',
    label: 'Interviews',
    icon: BarChart3,
  },
  {
    href: '/billing',
    label: 'Billing',
    icon: CreditCard,
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings2,
  },
]

export type NavigationProps = {
  isCollapsed: boolean
}

export function isNavigationItemActive(pathname: string, href: string) {
  if (pathname === '/' && href === '/dashboard') {
    return true
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function createNavigationItems(pathname: string): NavigationDumbItem[] {
  return navigationDefinitions.map(function mapNavigationDefinition(item) {
    return {
      ...item,
      isActive: isNavigationItemActive(pathname, item.href),
    }
  })
}

export function Navigation(props: NavigationProps) {
  const pathname = useRouterState({
    select: function selectPathname(state) {
      return state.location.pathname
    },
  })

  const items = createNavigationItems(pathname)

  return <NavigationDumb items={items} isCollapsed={props.isCollapsed} />
}
