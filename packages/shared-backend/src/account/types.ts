import {
  updateAccountProfileInputSchema,
  type AccountProfile,
  type UpdateAccountProfileInput,
} from '@mako/shared'

export type AccountSession = {
  userId: string
  email: string
}

export class AccountUnauthorizedError extends Error {
  constructor(message = 'You must be authenticated to access this resource.') {
    super(message)
    this.name = 'AccountUnauthorizedError'
  }
}

export class AccountNotFoundError extends Error {
  constructor(message = 'Account was not found for the active session.') {
    super(message)
    this.name = 'AccountNotFoundError'
  }
}

export class AccountValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccountValidationError'
  }
}

export type AccountProfileRecord = AccountProfile

export function parseProfileUpdateInput(
  input: unknown,
): UpdateAccountProfileInput {
  const parsed = updateAccountProfileInputSchema.safeParse(input)

  if (!parsed.success) {
    const error = parsed.error.issues[0]
    throw new AccountValidationError(error?.message ?? 'Invalid profile input.')
  }

  return parsed.data
}
