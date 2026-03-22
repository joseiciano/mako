import { createFileRoute } from '@tanstack/react-router'
import { LoginSmart } from './login-smart'

export const Route = createFileRoute('/auth/login/')({
  component: LoginPage,
})

function LoginPage() {
  return <LoginSmart />
}
