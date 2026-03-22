import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { Header, getRouteHeaderContent } from '#/components/layout/header'
import { AppShellDumb } from './app-shell-dumb'
import { MobileNavDumb } from '../mobile-nav/mobile-nav-dumb'
import {
  CORE_NAV_ITEMS,
  isCoreNavigationItemActive,
} from '../navigation/nav-items'
import { SidebarDumb } from '../sidebar/sidebar-dumb'

export type AppShellProps = {
  children: ReactNode
  userName?: string
}

export function AppShell(props: AppShellProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const pathname = useRouterState({
    select: function selectPathname(state) {
      return state.location.pathname
    },
  })

  useEffect(
    function closeMobileNavigationOnRouteChange() {
      setIsMobileNavOpen(false)
    },
    [pathname],
  )

  function openMobileNav() {
    setIsMobileNavOpen(true)
  }

  function closeMobileNav() {
    setIsMobileNavOpen(false)
  }

  const headerContent = getRouteHeaderContent(pathname)

  return (
    <AppShellDumb
      sidebar={
        <SidebarDumb
          navigationItems={CORE_NAV_ITEMS}
          pathname={pathname}
          isItemActive={isCoreNavigationItemActive}
        />
      }
      header={
        <Header
          pathname={pathname}
          userName={props.userName ?? 'Mako User'}
          navigation={null}
          isMobileNavOpen={isMobileNavOpen}
          onOpenMobileNav={openMobileNav}
        />
      }
      mobileNavigation={
        <MobileNavDumb
          isOpen={isMobileNavOpen}
          navigationItems={CORE_NAV_ITEMS}
          onClose={closeMobileNav}
          title={headerContent.title}
          pathname={pathname}
          isItemActive={isCoreNavigationItemActive}
        />
      }
    >
      {props.children}
    </AppShellDumb>
  )
}

export type AppShellSmartProps = AppShellProps
export const AppShellSmart = AppShell
