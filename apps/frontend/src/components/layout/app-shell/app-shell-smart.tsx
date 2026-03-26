import { useNavigate, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Header, getRouteHeaderContent } from '#/components/layout/header'
import { useAuth } from '#/hooks/use-auth'
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

export type RedirectToLoginState = {
  session: unknown | null
  isSessionPending: boolean
}

export function shouldRedirectToLogin(state: RedirectToLoginState): boolean {
  if (state.isSessionPending) {
    return false
  }

  return state.session === null
}

export function AppShell(props: AppShellProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const navigate = useNavigate()
  const pathname = useRouterState({
    select: function selectPathname(state) {
      return state.location.pathname
    },
  })
  const { isPending: isSessionPending, session } = useAuth()

  const redirectToLogin = shouldRedirectToLogin({
    session,
    isSessionPending,
  })

  useEffect(
    function redirectMissingSession() {
      if (!redirectToLogin) {
        return
      }

      void navigate({
        to: '/login',
        replace: true,
      })
    },
    [navigate, redirectToLogin],
  )

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
      isAuthLoading={isSessionPending || redirectToLogin}
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
