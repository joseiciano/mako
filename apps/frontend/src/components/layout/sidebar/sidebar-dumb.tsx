import type { ReactNode } from 'react'

export type SidebarDumbProps = {
  isCollapsed: boolean
  navigation: ReactNode
}

export function SidebarDumb(props: SidebarDumbProps) {
  return (
    <aside
      className={[
        'fixed inset-y-0 left-0 z-30 hidden border-r border-slate-800 bg-slate-950 lg:flex lg:flex-col',
        props.isCollapsed ? 'w-20' : 'w-64',
      ].join(' ')}
    >
      <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/20 text-sm font-semibold text-emerald-300">
          M
        </div>
        <span
          className={[
            'text-sm font-semibold tracking-wide text-white transition-opacity',
            props.isCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100',
          ].join(' ')}
        >
          Mako
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-4">{props.navigation}</div>
    </aside>
  )
}
