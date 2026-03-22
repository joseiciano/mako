import type { ReactNode } from 'react'

export type AuthGuardProps = {
  children: ReactNode
}

export type AuthGuardViewState = 'content' | 'loading' | 'redirect'

export type AuthGuardDumbProps = AuthGuardProps & {
  viewState: AuthGuardViewState
}
