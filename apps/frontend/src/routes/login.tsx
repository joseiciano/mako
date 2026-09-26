import { createFileRoute } from '@tanstack/react-router'
import { LoginSmart, type LoginSearch } from './auth/login/login-smart'
import type { LoginLinkError } from './auth/login/login-dumb'

const SUPPORTED_LINK_ERRORS: readonly string[] = [
  'TOKEN_EXPIRED',
  'INVALID_TOKEN',
]

function isSupportedLinkError(value: unknown): value is LoginLinkError {
  return (
    typeof value === 'string' &&
    SUPPORTED_LINK_ERRORS.includes(value)
  )
}

/**
 * Accepts only the Better Auth verification callback contract: a verified
 * flag of exactly true (or the string "true") and the two supported link
 * error codes. Every other query value is discarded so arbitrary URL
 * parameters can never reach the rendered page.
 */
export function validateLoginSearch(
  search: Record<string, unknown>,
): LoginSearch {
  const validated: LoginSearch = {}

  if (search.verified === true || search.verified === 'true') {
    validated.verified = true
  }

  if (isSupportedLinkError(search.error)) {
    validated.error = search.error
  }

  return validated
}

export const Route = createFileRoute('/login')({
  validateSearch: validateLoginSearch,
  component: LoginPage,
})

function LoginPage() {
  const search = Route.useSearch()

  return <LoginSmart search={search} />
}
