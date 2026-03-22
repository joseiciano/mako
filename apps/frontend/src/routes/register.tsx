import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/register')({
  beforeLoad: function redirectToAuthSignup() {
    throw redirect({ to: '/auth/signup' })
  },
})
