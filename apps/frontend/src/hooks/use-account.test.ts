import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fetchAccount,
  updateAccountProfile,
} from '#/hooks/use-account'

const accountFixture = {
  id: 'demo-user',
  email: 'demo@mako.dev',
  displayName: 'Demo Candidate',
  credits: 8,
  freeStandardInterviews: 1,
  freeAiInterviews: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
}

test('fetchAccount parses successful API responses', async function run() {
  const result = await fetchAccount(async function mockFetch(input, init) {
    assert.equal(input, '/api/account')
    assert.equal(init?.method, undefined)

    return new Response(JSON.stringify(accountFixture), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })
  })

  assert.equal(result.id, accountFixture.id)
  assert.equal(result.displayName, accountFixture.displayName)
})

test('updateAccountProfile sends PATCH payload and parses response', async function run() {
  const result = await updateAccountProfile(
    { displayName: 'Updated Name' },
    async function mockFetch(input, init) {
      assert.equal(input, '/api/account')
      assert.equal(init?.method, 'PATCH')
      assert.equal(readHeader(init?.headers, 'content-type'), 'application/json')

      const body = JSON.parse(String(init?.body))
      assert.equal(body.displayName, 'Updated Name')

      return new Response(
        JSON.stringify({
          ...accountFixture,
          displayName: 'Updated Name',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      )
    },
  )

  assert.equal(result.displayName, 'Updated Name')
})

test('fetchAccount surfaces backend error messages', async function run() {
  await assert.rejects(
    async function shouldThrow() {
      await fetchAccount(async function mockFetch() {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: {
            'content-type': 'application/json',
          },
        })
      })
    },
    function matcher(error) {
      assert.equal((error as Error).message, 'Unauthorized')
      return true
    },
  )
})

function readHeader(
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
