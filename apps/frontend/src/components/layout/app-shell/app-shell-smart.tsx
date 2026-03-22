import type { ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { getRouteHeaderContent } from '#/components/layout/header'
import { Navigation } from '#/components/layout/navigation'
import { AppShellDumb } from './app-shell-dumb'

export type AppShellProps = {
  children: ReactNode
  userName?: string
}

export function AppShell(props: AppShellProps) {
  const pathname = useRouterState({
    select: function selectPathname(state) {
      return state.location.pathname
    },
  })

  const headerContent = getRouteHeaderContent(pathname)

  return (
    <AppShellDumb
      title={headerContent.title}
      breadcrumbs={headerContent.breadcrumbs}
      userName={props.userName ?? 'Mako User'}
      navigation={<Navigation />}
    >
      {props.children}
    </AppShellDumb>
  )
}
