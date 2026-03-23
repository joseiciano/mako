import { createAuthClient } from 'better-auth/react'

function getAuthBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_AUTH_BASE_URL
  const authPath = '/api/auth'

  if (typeof configuredBaseUrl === 'string' && configuredBaseUrl.length > 0) {
    if (configuredBaseUrl.startsWith('http://') || configuredBaseUrl.startsWith('https://')) {
      return configuredBaseUrl
    }

    if (configuredBaseUrl.startsWith('/')) {
      if (typeof window !== 'undefined') {
        return new URL(configuredBaseUrl, window.location.origin).toString()
      }

      return `http://localhost:3000${configuredBaseUrl}`
    }

    return `http://${configuredBaseUrl}`
  }

  if (typeof window !== 'undefined') {
    return new URL(authPath, window.location.origin).toString()
  }

  return `http://localhost:3000${authPath}`
}

export const authClient = createAuthClient({
  baseURL: getAuthBaseUrl(),
})
