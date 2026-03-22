import {
  BarChart3,
  LayoutDashboard,
  Settings2,
} from 'lucide-react'
import { useRouterState } from '@tanstack/react-router'
import {
  NavigationDumb,
  type NavigationDumbChildItem,
  type NavigationDumbItem,
} from './navigation-dumb'

type NavigationDefinitionChild = Omit<NavigationDumbChildItem, 'isActive'>

type NavigationDefinition = Omit<NavigationDumbItem, 'isActive' | 'children'> & {
  children?: NavigationDefinitionChild[]
}

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
    href: '/settings',
    label: 'Settings',
    icon: Settings2,
    children: [
      {
        href: '/billing',
        label: 'Billing',
      },
    ],
  },
]

export type NavigationProps = {}

export function isNavigationItemActive(pathname: string, href: string) {
  if (pathname === '/' && href === '/dashboard') {
    return true
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function createNavigationItems(pathname: string): NavigationDumbItem[] {
  return navigationDefinitions.map(function mapNavigationDefinition(item) {
    const children = item.children?.map(function mapChildItem(childItem) {
      return {
        ...childItem,
        isActive: isNavigationItemActive(pathname, childItem.href),
      }
    })

    const hasActiveChild =
      children?.some(function someChildren(childItem) {
        return childItem.isActive
      }) ?? false

    return {
      href: item.href,
      label: item.label,
      icon: item.icon,
      children,
      isActive: isNavigationItemActive(pathname, item.href) || hasActiveChild,
    }
  })
}

export function Navigation(_: NavigationProps) {
  const pathname = useRouterState({
    select: function selectPathname(state) {
      return state.location.pathname
    },
  })

  const items = createNavigationItems(pathname)

  return <NavigationDumb items={items} />
}
