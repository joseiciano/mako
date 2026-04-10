export function readHeader(
  headers: HeadersInit | undefined,
  headerName: string,
): string | null {
  if (!headers) {
    return null
  }

  const normalizedHeaderName = headerName.toLowerCase()

  if (headers instanceof Headers) {
    return headers.get(headerName)
  }

  if (Array.isArray(headers)) {
    const matchedHeader = headers.find(function matches([name]) {
      return name.toLowerCase() === normalizedHeaderName
    })

    return matchedHeader ? matchedHeader[1] : null
  }

  const matchedHeader = Object.entries(headers).find(function matches([name]) {
    return name.toLowerCase() === normalizedHeaderName
  })

  if (!matchedHeader) {
    return null
  }

  return typeof matchedHeader[1] === 'string' ? matchedHeader[1] : null
}
