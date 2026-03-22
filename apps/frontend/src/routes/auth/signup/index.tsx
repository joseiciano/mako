import { createFileRoute } from '@tanstack/react-router'
import { SignupSmart } from './signup-smart'

export const Route = createFileRoute('/auth/signup/')({
  component: SignupPage,
})

function SignupPage() {
  return <SignupSmart />
}
