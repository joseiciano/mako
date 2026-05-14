import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Header, getRouteHeaderContent } from '#/components/layout/header'
import { authClient } from '#/lib/auth-client'
import {
  getAuthErrorMessage,
  handleSignOutSuccess,
  throwIfAuthResultHasError,
} from '#/routes/auth/shared/auth-flow'
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

function resolveUserName(user: unknown, fallbackUserName?: string): string {
  if (typeof fallbackUserName === 'string' && fallbackUserName.trim().length > 0) {
    return fallbackUserName
  }

  if (typeof user === 'object' && user !== null) {
    const authUser = user as {
      name?: unknown
      email?: unknown
    }

    if (typeof authUser.name === 'string' && authUser.name.trim().length > 0) {
      return authUser.name
    }

    if (typeof authUser.email === 'string' && authUser.email.trim().length > 0) {
      return authUser.email
    }
  }

  return 'Mako User'
}

export function AppShell(props: AppShellProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const pathname = useRouterState({
    select: function selectPathname(state) {
      return state.location.pathname
    },
  })

  const signOutMutation = useMutation({
    mutationFn: async function signOutCurrentSession() {
      const result = await authClient.signOut()
      throwIfAuthResultHasError(result)

      return result
    },
    onSuccess: async function onSignOutSuccess() {
      await handleSignOutSuccess(queryClient, function navigateToLogin(path) {
        return navigate({ to: path, replace: true })
      })
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
  const resolvedUserName = resolveUserName(null, props.userName)

  return (
    <>
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
            userName={resolvedUserName}
            navigation={null}
            isMobileNavOpen={isMobileNavOpen}
            onOpenMobileNav={openMobileNav}
            isSigningOut={signOutMutation.isPending}
            onSignOut={function onSignOut() {
              signOutMutation.mutate()
            }}
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

      {signOutMutation.error ? (
        <p className="fixed bottom-6 right-6 rounded-lg border border-rose-900 bg-rose-950/90 px-4 py-2 text-sm text-rose-200 shadow-xl shadow-slate-950/40">
          {getAuthErrorMessage(signOutMutation.error)}
        </p>
      ) : null}
    </>
  )
}

export type AppShellSmartProps = AppShellProps
export const AppShellSmart = AppShell
