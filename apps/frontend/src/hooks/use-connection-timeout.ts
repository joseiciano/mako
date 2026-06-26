import { useCallback, useEffect, useRef } from 'react'

const CONNECTION_TIMEOUT_MS = 30000

type UseConnectionTimeoutArgs = {
  onTimeout: () => void
}

export function useConnectionTimeout({ onTimeout }: UseConnectionTimeoutArgs) {
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
      connectionTimeoutRef.current = null
    }
  }, [])

  const startConnectionTimeout = useCallback(() => {
    clearConnectionTimeout()
    connectionTimeoutRef.current = setTimeout(onTimeout, CONNECTION_TIMEOUT_MS)
  }, [clearConnectionTimeout, onTimeout])

  useEffect(() => {
    return clearConnectionTimeout
  }, [clearConnectionTimeout])

  return { startConnectionTimeout, clearConnectionTimeout }
}
