import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({
  beforeLoad: function redirectToAuthLogin() {
    throw redirect({ to: '/auth/login' })
  },
})
