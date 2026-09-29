export function resolveLocalTestDatabaseUrl(
  databaseUrl = process.env.DATABASE_URL,
): string {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for integration tests.')
  }

  let parsedDatabaseUrl: URL

  try {
    parsedDatabaseUrl = new URL(databaseUrl)
  } catch {
    throw new Error('DATABASE_URL must be a parseable URL for integration tests.')
  }

  if (
    parsedDatabaseUrl.hostname !== 'localhost' &&
    parsedDatabaseUrl.hostname !== '127.0.0.1'
  ) {
    throw new Error(
      'DATABASE_URL must use localhost or 127.0.0.1 for integration tests.',
    )
  }

  if (!parsedDatabaseUrl.pathname.endsWith('_test')) {
    throw new Error(
      'DATABASE_URL database path must end with "_test" for integration tests.',
    )
  }

  const fragmentIndex = databaseUrl.indexOf('#')
  const urlWithoutFragment =
    fragmentIndex === -1 ? databaseUrl : databaseUrl.slice(0, fragmentIndex)
  if (urlWithoutFragment.includes('?')) {
    throw new Error(
      'DATABASE_URL must not include query parameters for integration tests.',
    )
  }

  return databaseUrl
}
