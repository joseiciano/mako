export type FakeHandler = (request: Request) => Response | Promise<Response>

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

export function unauthorized(): Response {
  return jsonResponse(
    { success: false, errors: [{ code: 10000, message: 'Authentication error' }] },
    401,
  )
}

export function notFound(): Response {
  return jsonResponse(
    { success: false, errors: [{ code: 7003, message: 'No route for the URI' }] },
    404,
  )
}

/** Accepts any bearer token value; only the header's presence is checked. */
export function hasAuthorization(request: Request): boolean {
  const header = request.headers.get('authorization')
  return header !== null && header.trim().length > 0
}
