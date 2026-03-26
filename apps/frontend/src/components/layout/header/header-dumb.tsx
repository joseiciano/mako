import type { ReactNode } from 'react'

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
  navigation: ReactNode
  userName: string
  isMobileNavOpen?: boolean
  onOpenMobileNav?: () => void
  isSigningOut?: boolean
  onSignOut?: () => void
}

const headerActionButtonClassName =
  'inline-flex h-9 select-none items-center gap-2 rounded-md border border-slate-700 px-3 text-sm font-medium text-slate-200 transition-colors hover:border-slate-500 hover:text-white'

export function HeaderDumb(props: HeaderDumbProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button
            type="button"
            aria-controls="mobile-navigation-drawer"
            aria-expanded={props.isMobileNavOpen ?? false}
            aria-label="Open navigation menu"
            onClick={props.onOpenMobileNav}
            className="inline-flex size-9 items-center justify-center rounded-md border border-slate-700 text-slate-200 transition-colors hover:border-slate-500 hover:text-white lg:hidden"
          >
            ☰
          </button>

          <div className="hidden size-8 items-center justify-center rounded-lg bg-emerald-500/20 text-sm font-semibold text-emerald-300 sm:flex">
            M
          </div>

          <div className="min-w-0 shrink">
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
              <h1 className="truncate text-sm font-semibold text-white sm:text-base">
                {props.title}
              </h1>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center lg:flex">{props.navigation}</div>

          <details className="relative shrink-0">
            <summary
              className={`${headerActionButtonClassName} list-none cursor-pointer`}
            >
              <span className="hidden sm:inline">{props.userName}</span>
              <span
                aria-hidden
                className="flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-300"
              >
                {props.userName[0]?.toUpperCase() ?? 'U'}
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
                onClick={props.onSignOut}
                disabled={props.isSigningOut}
                className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm text-rose-300 transition-colors hover:bg-rose-950/40 hover:text-rose-200"
              >
                {props.isSigningOut ? 'Signing out...' : 'Logout'}
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  )
}
