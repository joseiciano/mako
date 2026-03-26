import { createFileRoute } from '@tanstack/react-router'
import { SignupSmart } from './auth/signup/signup-smart'

export const Route = createFileRoute('/register')({
  component: RegisterPage,
})

function RegisterPage() {
  return <SignupSmart />
}
