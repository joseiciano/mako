import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import '../redesign.css'
import { isCoreNavigationItemActive, type NavigationItem } from '../navigation/nav-items'

export type RedesignShellProps = {
  navigationItems: readonly NavigationItem[]
  pathname: string
  userName: string
  isSigningOut: boolean
  onSignOut: () => void
  children: ReactNode
}

export function RedesignShell(props: RedesignShellProps) {
  return (
    <div className="rp">
      <header className="rp-top">
        <span className="rp-logo">mako</span>
        <span className="rp-spacer" />
        <span className="mute">{props.userName}</span>
        <button type="button" className="rp-btn g" disabled={props.isSigningOut} onClick={props.onSignOut}>
          {props.isSigningOut ? 'Signing out...' : 'Sign out'}
        </button>
      </header>
      <div className="rp-body">
        <aside className="rp-side">
          <nav className="rp-nav" aria-label="Primary">
            {props.navigationItems.map((item) => (
              <Link
                key={item.href}
                to={item.href as never}
                aria-current={isCoreNavigationItemActive(props.pathname, item.href) ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="rp-main">{props.children}</main>
      </div>
    </div>
  )
}
