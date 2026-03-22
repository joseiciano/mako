import type { ComponentType } from 'react'

export type NavigationIcon = ComponentType<{
  className?: string
  'aria-hidden'?: boolean
}>

export type NavigationDumbItem = {
  href: string
  label: string
  icon: NavigationIcon
  isActive: boolean
}

export type NavigationDumbProps = {
  items: NavigationDumbItem[]
  isCollapsed: boolean
}

export function NavigationDumb(props: NavigationDumbProps) {
  return (
    <nav aria-label="Primary" className="w-full">
      <ul className="space-y-2">
        {props.items.map(function renderItem(item) {
          const Icon = item.icon

          return (
            <li key={item.href}>
              <a
                href={item.href}
                aria-current={item.isActive ? 'page' : undefined}
                className={[
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  item.isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white',
                  props.isCollapsed ? 'justify-center' : '',
                ].join(' ')}
              >
                <Icon aria-hidden className="size-5 shrink-0" />
                <span className={props.isCollapsed ? 'sr-only' : 'truncate'}>
                  {item.label}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
