import { useEffect, useRef } from 'react'
import type { NavigationItem } from '../navigation/nav-items'

export type MobileNavDumbProps = {
  isOpen: boolean
  navigationItems: readonly NavigationItem[]
  onClose: () => void
  pathname: string
  isItemActive: (pathname: string, href: string) => boolean
  title?: string
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    function isVisible(element) {
      return !element.hasAttribute('hidden')
    },
  )
}

export function MobileNavDumb(props: MobileNavDumbProps) {
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(
    function setupAccessibilityGuards() {
      if (!props.isOpen || typeof document === 'undefined') {
        return
      }

      const drawerElement = drawerRef.current

      if (!drawerElement) {
        return
      }

      const drawer = drawerElement

      const previouslyFocusedElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      const originalBodyOverflow = document.body.style.overflow

      const focusableElements = getFocusableElements(drawer)
      const firstElement = focusableElements[0]
      firstElement?.focus()

      function onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
          event.preventDefault()
          props.onClose()
          return
        }

        if (event.key !== 'Tab') {
          return
        }

        const drawerFocusableElements = getFocusableElements(drawer)

        if (drawerFocusableElements.length === 0) {
          event.preventDefault()
          return
        }

        const firstFocusable = drawerFocusableElements[0]
        const lastFocusable =
          drawerFocusableElements[drawerFocusableElements.length - 1]

        if (event.shiftKey && document.activeElement === firstFocusable) {
          event.preventDefault()
          lastFocusable.focus()
          return
        }

        if (!event.shiftKey && document.activeElement === lastFocusable) {
          event.preventDefault()
          firstFocusable.focus()
        }
      }

      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onKeyDown)

      return function cleanupAccessibilityGuards() {
        document.body.style.overflow = originalBodyOverflow
        document.removeEventListener('keydown', onKeyDown)
        previouslyFocusedElement?.focus()
      }
    },
    [props.isOpen, props.onClose],
  )

  if (!props.isOpen) {
    return null
  }

  const drawerTitle = props.title ?? 'Menu'

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <button
        type="button"
        aria-label="Close navigation menu"
        onClick={props.onClose}
        className="absolute inset-0 bg-slate-950/70"
      />

      <div
        ref={drawerRef}
        id="mobile-navigation-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation menu"
        className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-slate-800 bg-slate-900 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-white">{drawerTitle}</h2>
          <button
            type="button"
            aria-label="Close menu"
            onClick={props.onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-slate-100 transition-colors hover:bg-slate-800"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ×
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <nav aria-label="Mobile navigation">
            <ul className="space-y-1">
              {props.navigationItems.map(function renderNavigationItem(item) {
                const isActive = props.isItemActive(props.pathname, item.href)

                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={props.onClose}
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
      </div>
    </div>
  )
}
