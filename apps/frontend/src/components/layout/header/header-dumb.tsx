export type BreadcrumbItem = {
  href: string
  label: string
}

export type HeaderContent = {
  title: string
  breadcrumbs: BreadcrumbItem[]
}

export type HeaderDumbProps = {
  title: string
  breadcrumbs: BreadcrumbItem[]
  userName: string
  isSidebarCollapsed: boolean
  onSidebarToggle: () => void
}

const routeTitleMap: Record<string, string> = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/interviews': 'Interviews',
  '/billing': 'Billing',
  '/settings': 'Settings',
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

  const breadcrumbs = segments.map(function mapSegment(segment, index) {
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

export function HeaderDumb(props: HeaderDumbProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950/95 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          disabled
          title="Mobile menu toggle will be implemented in story 1.7"
          aria-label="Open mobile navigation menu (coming soon)"
          className="inline-flex size-9 items-center justify-center rounded-md border border-slate-700 text-slate-400 lg:hidden"
        >
          ☰
        </button>

        <button
          type="button"
          onClick={props.onSidebarToggle}
          aria-label={
            props.isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
          }
          className="hidden rounded-md border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-white lg:inline-flex"
        >
          {props.isSidebarCollapsed ? 'Expand' : 'Collapse'}
        </button>

        {props.breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex items-center gap-2 text-sm text-slate-300">
              {props.breadcrumbs.map(function renderBreadcrumb(item, index) {
                const isLast = index === props.breadcrumbs.length - 1

                return (
                  <li key={item.href} className="flex items-center gap-2">
                    {index > 0 ? <span className="text-slate-600">/</span> : null}
                    {isLast ? (
                      <span className="truncate font-medium text-white">
                        {item.label}
                      </span>
                    ) : (
                      <a
                        href={item.href}
                        className="truncate text-slate-400 transition-colors hover:text-slate-200"
                      >
                        {item.label}
                      </a>
                    )}
                  </li>
                )
              })}
            </ol>
          </nav>
        ) : (
          <h1 className="truncate text-lg font-semibold text-white">
            {props.title}
          </h1>
        )}
      </div>

      <details className="relative">
        <summary className="list-none">
          <span className="inline-flex cursor-pointer select-none items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500 hover:text-white">
            <span className="hidden sm:inline">{props.userName}</span>
            <span
              aria-hidden
              className="flex size-7 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-300"
            >
              {props.userName[0]?.toUpperCase() ?? 'U'}
            </span>
          </span>
        </summary>
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl">
          <p className="px-3 py-2 text-sm font-medium text-slate-100">
            {props.userName}
          </p>
          <a
            href="/settings"
            className="block rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            Profile
          </a>
          <button
            type="button"
            className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm text-rose-300 transition-colors hover:bg-rose-950/40 hover:text-rose-200"
          >
            Logout
          </button>
        </div>
      </details>
    </header>
  )
}
