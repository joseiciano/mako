import { authClient } from '@mako/shared-frontend'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useAuth } from '#/hooks/use-auth'
import {
  getAuthErrorMessage,
  handleSignOutSuccess,
} from '#/routes/auth/shared/auth-flow'
import { AppShellDumb } from './app-shell-dumb'

type AppShellProps = {
  pageTitle: string
  children: ReactNode
}

export function AppShell(props: AppShellProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const auth = useAuth()

  const signOutMutation = useMutation({
    mutationFn: function signOut() {
      return authClient.signOut()
    },
    onSuccess: async function onSignOutSuccess() {
      await handleSignOutSuccess(queryClient, function navigateToLogin(path) {
        return navigate({ to: path })
      })
    },
  })

  return (
    <>
      <AppShellDumb
        pageTitle={props.pageTitle}
        userName={auth.user?.name ?? auth.user?.email ?? 'Account'}
        isSigningOut={signOutMutation.isPending}
        onSignOut={function onSignOut() {
          signOutMutation.mutate()
        }}
      >
        {props.children}
      </AppShellDumb>
      {signOutMutation.error ? (
        <p className="fixed bottom-6 right-6 rounded-lg border border-rose-900 bg-rose-950/90 px-4 py-2 text-sm text-rose-200 shadow-xl shadow-slate-950/40">
          {getAuthErrorMessage(signOutMutation.error)}
        </p>
      ) : null}
    </>
  )
}
