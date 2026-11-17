const allowedHostnames = new Set(['localhost', '127.0.0.1', '[::1]', 'postgres'])
const allowedQueryParameters = new Set(['sslmode'])
const allowedProtocols = new Set(['postgres:', 'postgresql:'])

export function assertLocalDatabaseUrl(databaseUrl) {
  let parsedUrl

  try {
    parsedUrl = new URL(databaseUrl)
  } catch {
    throw new Error(
      'Refusing to run the local stack: database URL is missing or not a valid URL.',
    )
  }

  if (
    !allowedProtocols.has(parsedUrl.protocol) ||
    !allowedHostnames.has(parsedUrl.hostname.toLowerCase())
  ) {
    throw new Error(
      `Refusing to run the local stack against database host "${parsedUrl.hostname}". Only localhost, 127.0.0.1, ::1 and the Compose service "postgres" are allowed.`,
    )
  }

  for (const name of parsedUrl.searchParams.keys()) {
    if (!allowedQueryParameters.has(name)) {
      throw new Error(
        `Refusing to run the local stack: database URL parameter "${name}" is not allowed (it can override the host).`,
      )
    }
  }

  return databaseUrl
}
