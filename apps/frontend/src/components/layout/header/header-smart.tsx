import type { ReactNode } from 'react'
import {
  HeaderDumb,
  type BreadcrumbItem,
  type HeaderContent,
} from './header-dumb'

export type HeaderProps = {
  pathname: string
  navigation: ReactNode
  userName: string
  isMobileNavOpen?: boolean
  onOpenMobileNav?: () => void
  isSigningOut?: boolean
  onSignOut?: () => void
}

const routeTitleMap: Record<string, string> = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/interviews': 'Interviews',
  '/interviews/new': 'Schedule Interview',
  '/billing': 'Billing',
  '/settings': 'Settings',
  '/admin/reviews': 'Application Reviews',
}

export function formatPathSegment(segment: string) {
  return segment
    .split('-')
    .filter(Boolean)
    .map(function formatWord(word) {
      return word[0]?.toUpperCase() + word.slice(1)
    })
    .join(' ')
}

export function getRouteHeaderContent(pathname: string): HeaderContent {
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length === 0) {
    return {
      title: 'Dashboard',
      breadcrumbs: [],
    }
  }

  if (segments.length === 1) {
    const routePath = `/${segments[0]}`

    return {
      title: routeTitleMap[routePath] ?? formatPathSegment(segments[0]),
      breadcrumbs: [],
    }
  }

  const breadcrumbs: BreadcrumbItem[] = segments.map(function mapSegment(
    segment,
    index,
  ) {
    const href = `/${segments.slice(0, index + 1).join('/')}`

    return {
      href,
      label: routeTitleMap[href] ?? formatPathSegment(segment),
    }
  })

  const title = breadcrumbs[breadcrumbs.length - 1].label

  return {
    title,
    breadcrumbs,
  }
}

export function Header(props: HeaderProps) {
  const headerContent = getRouteHeaderContent(props.pathname)

  return (
    <HeaderDumb
      title={headerContent.title}
      breadcrumbs={headerContent.breadcrumbs}
      navigation={props.navigation}
      userName={props.userName}
      isMobileNavOpen={props.isMobileNavOpen}
      onOpenMobileNav={props.onOpenMobileNav}
      isSigningOut={props.isSigningOut}
      onSignOut={props.onSignOut}
    />
  )
}
