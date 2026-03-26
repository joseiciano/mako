export const AUTHENTICATED_REDIRECT_PATH = '/dashboard'
export const LOGGED_OUT_REDIRECT_PATH = '/login'

type NavigateFn = (to: string) => Promise<void> | void

type AuthResult = {
  error?: unknown
}

export async function handleAuthSuccess(
  navigate: NavigateFn,
): Promise<void> {
  await navigate(AUTHENTICATED_REDIRECT_PATH)
}

export async function handleSignOutSuccess(
  navigate: NavigateFn,
): Promise<void> {
  await navigate(LOGGED_OUT_REDIRECT_PATH)
}

export function throwIfAuthResultHasError(result: AuthResult): void {
  if (result.error == null) {
    return
  }

  throw new Error(getAuthErrorMessage(result.error))
}

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message

    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  }

  return 'Something went wrong. Please try again.'
}
