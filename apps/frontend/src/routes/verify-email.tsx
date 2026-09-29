import { createFileRoute } from '@tanstack/react-router'
import { VerifyEmailDumb } from './auth/verify-email/verify-email-dumb'

export const Route = createFileRoute('/verify-email')({
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  return <VerifyEmailDumb />
}
