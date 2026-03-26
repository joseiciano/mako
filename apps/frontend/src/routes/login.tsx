import { createFileRoute } from '@tanstack/react-router'
import { LoginSmart } from './auth/login/login-smart'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  return <LoginSmart />
}
