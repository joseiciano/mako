import type { ReactNode } from 'react'
import {
  HeaderDumb,
  type BreadcrumbItem,
} from '#/components/layout/header'
import { SidebarDumb } from '#/components/layout/sidebar'

export type AppShellDumbProps = {
  children: ReactNode
  navigation: ReactNode
  title: string
  breadcrumbs: BreadcrumbItem[]
  userName: string
  isSidebarCollapsed: boolean
  onSidebarToggle: () => void
}

export function AppShellDumb(props: AppShellDumbProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <SidebarDumb
        isCollapsed={props.isSidebarCollapsed}
        navigation={props.navigation}
      />

      <div
        className={[
          'transition-[padding] duration-200 ease-in-out',
          props.isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64',
        ].join(' ')}
      >
        <div className="flex h-screen flex-col overflow-hidden">
          <HeaderDumb
            title={props.title}
            breadcrumbs={props.breadcrumbs}
            userName={props.userName}
            isSidebarCollapsed={props.isSidebarCollapsed}
            onSidebarToggle={props.onSidebarToggle}
          />
          <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
            {props.children}
          </main>
        </div>
      </div>
    </div>
  )
}
