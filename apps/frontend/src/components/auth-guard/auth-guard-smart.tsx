import { useLocation } from '@tanstack/react-router'
import { useAuth } from '../../hooks/use-auth'
import { AuthGuardDumb } from './auth-guard-dumb'
import type { AuthGuardProps, AuthGuardViewState } from './types'

const PUBLIC_PATHNAMES = new Set(['/login'])

export type ResolveAuthGuardViewStateArgs = {
  pathname: string
  isLoading: boolean
  isAuthenticated: boolean
}

export function resolveAuthGuardViewState(
  args: ResolveAuthGuardViewStateArgs,
): AuthGuardViewState {
  if (PUBLIC_PATHNAMES.has(args.pathname)) {
    return 'content'
  }

  if (args.isLoading) {
    return 'loading'
  }

  if (!args.isAuthenticated) {
    return 'redirect'
  }

  return 'content'
}

export function AuthGuardSmart(props: AuthGuardProps) {
  const location = useLocation()
  const auth = useAuth()

  const viewState = resolveAuthGuardViewState({
    pathname: location.pathname,
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated,
  })

  return <AuthGuardDumb viewState={viewState}>{props.children}</AuthGuardDumb>
}
