export function readHeader(
  headers: HeadersInit | undefined,
  headerName: string,
): string | null {
  if (!headers) {
    return null
  }

  if (headers instanceof Headers) {
    return headers.get(headerName)
  }

  if (Array.isArray(headers)) {
    const matchedHeader = headers.find(function matches([name]) {
      return name === headerName
    })

    return matchedHeader ? matchedHeader[1] : null
  }

  const headerValue = headers[headerName]
  return typeof headerValue === 'string' ? headerValue : null
}
