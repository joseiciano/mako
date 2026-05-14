import { useEffect, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '#/hooks/use-auth'
import { LOGGED_OUT_REDIRECT_PATH } from '#/routes/auth/shared/auth-flow'
import { AuthGuardDumb } from './auth-guard-dumb'

export type AuthGuardProps = {
  children: ReactNode
}

export function AuthGuardSmart(props: AuthGuardProps) {
  const navigate = useNavigate()
  const { error, isAuthenticated, isPending } = useAuth()

  useEffect(
    function redirectMissingSession() {
      if (isPending || isAuthenticated || error != null) {
        return
      }

      void navigate({
        to: LOGGED_OUT_REDIRECT_PATH,
        replace: true,
      })
    },
    [error, isAuthenticated, isPending, navigate],
  )

  return (
    <AuthGuardDumb
      error={error}
      isAuthenticated={isAuthenticated}
      isPending={isPending}
    >
      {props.children}
    </AuthGuardDumb>
  )
}

export const AuthGuard = AuthGuardSmart
