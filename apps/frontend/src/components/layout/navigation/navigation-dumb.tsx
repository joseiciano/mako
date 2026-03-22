import type { ComponentType } from 'react'

export type NavigationIcon = ComponentType<{
  className?: string
  'aria-hidden'?: boolean
}>

export type NavigationDumbChildItem = {
  href: string
  label: string
  isActive: boolean
}

export type NavigationDumbItem = {
  href: string
  label: string
  icon: NavigationIcon
  isActive: boolean
  children?: NavigationDumbChildItem[]
}

export type NavigationDumbProps = {
  items: NavigationDumbItem[]
}

export function NavigationDumb(props: NavigationDumbProps) {
  return (
    <nav aria-label="Primary" className="w-full">
      <ul className="flex items-center gap-2 overflow-x-auto pb-1">
        {props.items.map(function renderItem(item) {
          const Icon = item.icon
          const hasChildren = Boolean(item.children?.length)

          return (
            <li key={item.href} className="shrink-0">
              {hasChildren ? (
                <details className="relative">
                  <summary
                    className={[
                      'flex cursor-pointer list-none items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                      item.isActive
                        ? 'border-slate-600 bg-slate-800 text-white'
                        : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white',
                    ].join(' ')}
                  >
                    <Icon aria-hidden className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </summary>
                  <div className="absolute left-0 mt-2 min-w-44 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl">
                    <ul className="space-y-1">
                      {item.children?.map(function renderChildItem(childItem) {
                        return (
                          <li key={childItem.href}>
                            <a
                              href={childItem.href}
                              aria-current={childItem.isActive ? 'page' : undefined}
                              className={[
                                'block rounded-md px-3 py-2 text-sm transition-colors',
                                childItem.isActive
                                  ? 'bg-slate-800 text-white'
                                  : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                              ].join(' ')}
                            >
                              {childItem.label}
                            </a>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </details>
              ) : (
                <a
                  href={item.href}
                  aria-current={item.isActive ? 'page' : undefined}
                  className={[
                    'group flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                    item.isActive
                      ? 'border-slate-600 bg-slate-800 text-white'
                      : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white',
                  ].join(' ')}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
