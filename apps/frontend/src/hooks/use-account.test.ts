import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createOptimisticCompany,
  fetchAccount,
  fetchCompanies,
  postCompany,
  updateAccountProfile,
} from './use-account'

const accountFixture = {
  id: 'demo-user',
  email: 'demo@mako.dev',
  displayName: 'Demo Candidate',
  credits: 8,
  freeStandardInterviews: 1,
  freeAiInterviews: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('use-account hooks', function useAccountHooksSuite() {
  afterEach(function afterEachTest() {
    vi.restoreAllMocks()
  })

  it('fetchAccount parses successful API responses', async function run() {
    const result = await fetchAccount(async function mockFetch(input, init) {
      expect(input).toBe('/api/account')
      expect(init?.method).toBeUndefined()

      return new Response(JSON.stringify(accountFixture), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    expect(result.id).toBe(accountFixture.id)
    expect(result.displayName).toBe(accountFixture.displayName)
  })

  it('updateAccountProfile sends PATCH payload and parses response', async function run() {
    const result = await updateAccountProfile(
      { displayName: 'Updated Name' },
      async function mockFetch(input, init) {
        expect(input).toBe('/api/account')
        expect(init?.method).toBe('PATCH')
        expect(readHeader(init?.headers, 'content-type')).toBe('application/json')

        const body = JSON.parse(String(init?.body))
        expect(body.displayName).toBe('Updated Name')

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

    expect(result.displayName).toBe('Updated Name')
  })

  it('fetchAccount surfaces backend error messages', async function run() {
    await expect(
      fetchAccount(async function mockFetch() {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: {
            'content-type': 'application/json',
          },
        })
      }),
    ).rejects.toThrow('Unauthorized')
  })

  it('fetchCompanies returns companies payload', async function shouldFetchCompanies() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async function fetchMock() {
        return new Response(
          JSON.stringify({
            companies: [
              {
                id: 'company-id',
                userId: 'user-id',
                company: 'mako',
                joined: '2024-01-01T00:00:00.000Z',
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-01T00:00:00.000Z',
              },
            ],
          }),
          { status: 200 },
        )
      }),
    )

    const companies = await fetchCompanies()

    expect(companies).toHaveLength(1)
    expect(companies[0]?.company).toBe('mako')
  })

  it('postCompany throws when request fails', async function shouldThrowOnFailedPost() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async function fetchMock() {
        return new Response(JSON.stringify({ error: 'boom' }), { status: 500 })
      }),
    )

    await expect(
      postCompany({
        company: 'Mako',
        joined: '2023-02-10',
      }),
    ).rejects.toThrow('boom')
  })

  it('creates an optimistic company record', function shouldCreateOptimisticRecord() {
    const optimisticCompany = createOptimisticCompany({
      company: ' Stripe ',
      joined: '2022-06-01',
    })

    expect(optimisticCompany.id.startsWith('optimistic-')).toBe(true)
    expect(optimisticCompany.company).toBe('stripe')
    expect(optimisticCompany.joined).toBe('2022-06-01T00:00:00.000Z')
  })
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
