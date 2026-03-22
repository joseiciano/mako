import type { NavigationItem } from '../navigation/nav-items'

export type SidebarDumbProps = {
  appName?: string
  navigationItems: readonly NavigationItem[]
  pathname: string
  isItemActive: (pathname: string, href: string) => boolean
}

export function SidebarDumb(props: SidebarDumbProps) {
  const appName = props.appName ?? 'Mako'

  return (
    <aside className="hidden border-r border-slate-800 bg-slate-900 lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col">
      <div className="border-b border-slate-800 px-6 py-5">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
          Application
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">{appName}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <nav aria-label="Desktop navigation">
          <ul className="space-y-1">
            {props.navigationItems.map(function renderNavigationItem(item) {
              const isActive = props.isItemActive(props.pathname, item.href)

              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={[
                      'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-200 hover:bg-slate-800 hover:text-white',
                    ].join(' ')}
                  >
                    {item.label}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </aside>
  )
}
