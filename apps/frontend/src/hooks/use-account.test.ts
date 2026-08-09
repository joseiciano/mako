import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createOptimisticCompany,
  deleteCompanyRecord,
  fetchAccount,
  fetchCompanies,
  patchCompany,
  postCompany,
  updateAccountProfile,
} from './use-account'
import { readHeader } from './test-utils/read-header'

const accountFixture = {
  id: 'demo-user',
  email: 'demo@mako.dev',
  displayName: 'Demo Candidate',
  credits: 8,
  freeStandardInterviews: 1,
  freeAiInterviews: 1,
  isVerifiedInterviewer: false,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const companyRecordFixture = {
  id: 'company-id',
  userId: 'user-id',
  company: 'mako',
  role: 'Software Engineer',
  start: '2022-01-15',
  end: '2024-03-01',
  isComplete: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  joined: '2022-01-15T00:00:00.000Z',
}

describe('use-account hooks', function useAccountHooksSuite() {
  afterEach(function afterEachTest() {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('fetchAccount parses successful API responses', async function run() {
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    const result = await fetchAccount(async function mockFetch(input, init) {
      expect(input).toBe('https://api.test.local/api/account')
      expect(init?.method).toBeUndefined()
      expect(init?.credentials).toBe('include')

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
    vi.stubEnv(
      'VITE_AUTH_BASE_URL',
      'https://api.test.local/api/auth',
    )

    const result = await updateAccountProfile(
      { displayName: 'Updated Name' },
      async function mockFetch(input, init) {
        expect(input).toBe('https://api.test.local/api/account')
        expect(init?.method).toBe('PATCH')
        expect(init?.credentials).toBe('include')
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

  it('fetchCompanies returns the employment record shape', async function shouldFetchCompanies() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async function fetchMock() {
        return new Response(
          JSON.stringify({
            companies: [companyRecordFixture],
          }),
          { status: 200 },
        )
      }),
    )

    const companies = await fetchCompanies()

    expect(companies).toHaveLength(1)
    expect(companies[0]).toMatchObject({
      company: 'mako',
      role: 'Software Engineer',
      start: '2022-01-15',
      end: '2024-03-01',
      isComplete: true,
      joined: '2022-01-15T00:00:00.000Z',
    })
  })

  it('postCompany sends the canonical payload', async function shouldSendCanonicalPayload() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async function fetchMock(input, init) {
        expect(input).toBe('/api/companies')
        expect(init?.method).toBe('POST')
        expect(readHeader(init?.headers, 'content-type')).toBe('application/json')

        const body = JSON.parse(String(init?.body))
        expect(body).toEqual({
          company: 'Mako',
          role: 'Engineer',
          start: '2023-02-10',
          end: null,
        })
        expect(body.joined).toBeUndefined()

        return new Response(
          JSON.stringify({
            company: {
              ...companyRecordFixture,
              company: 'mako',
            },
          }),
          { status: 200 },
        )
      }),
    )

    const result = await postCompany({
      company: 'Mako',
      role: 'Engineer',
      start: '2023-02-10',
      end: null,
    })

    expect(result.company.company).toBe('mako')
    expect(result.company.role).toBe('Software Engineer')
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
        role: 'Engineer',
        start: '2023-02-10',
        end: null,
      }),
    ).rejects.toThrow('boom')
  })

  it('patchCompany sends the canonical payload to the record id', async function shouldSendPatchPayload() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async function fetchMock(input, init) {
        expect(input).toBe('/api/companies/company-id')
        expect(init?.method).toBe('PATCH')
        expect(readHeader(init?.headers, 'content-type')).toBe('application/json')

        const body = JSON.parse(String(init?.body))
        expect(body).toEqual({
          company: 'Mako',
          role: 'Engineer',
          start: '2023-02-10',
          end: '2024-01-01',
        })
        expect(body.id).toBeUndefined()

        return new Response(
          JSON.stringify({
            company: {
              ...companyRecordFixture,
              company: 'mako',
            },
          }),
          { status: 200 },
        )
      }),
    )

    const result = await patchCompany({
      id: 'company-id',
      company: 'Mako',
      role: 'Engineer',
      start: '2023-02-10',
      end: '2024-01-01',
    })

    expect(result.company.id).toBe('company-id')
    expect(result.company.company).toBe('mako')
  })

  it('deleteCompanyRecord sends a DELETE request for the record id', async function shouldSendDeleteRequest() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async function fetchMock(input, init) {
        expect(input).toBe('/api/companies/company-id')
        expect(init?.method).toBe('DELETE')

        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }),
    )

    const result = await deleteCompanyRecord('company-id')

    expect(result).toEqual({ success: true })
  })

  it('fetchAccount forwards abort signal into fetch init', async function run() {
    const controller = new AbortController()
    const signal = controller.signal

    await fetchAccount(
      async function mockFetch(_input, init) {
        expect(init?.signal).toBe(signal)
        return new Response(JSON.stringify(accountFixture), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        })
      },
      signal,
    )
  })

  it('fetchCompanies forwards abort signal into fetch init', async function run() {
    const controller = new AbortController()
    const signal = controller.signal

    await fetchCompanies(
      async function mockFetch(_input, init) {
        expect(init?.signal).toBe(signal)
        return new Response(
          JSON.stringify({
            companies: [],
          }),
          { status: 200 },
        )
      },
      signal,
    )
  })

  it('creates an optimistic employment record', function shouldCreateOptimisticRecord() {
    const optimisticCompany = createOptimisticCompany({
      company: 'Stripe',
      role: 'Engineer',
      start: '2022-06-01',
      end: null,
    })

    expect(optimisticCompany.id.startsWith('optimistic-')).toBe(true)
    expect(optimisticCompany.company).toBe('Stripe')
    expect(optimisticCompany.role).toBe('Engineer')
    expect(optimisticCompany.start).toBe('2022-06-01')
    expect(optimisticCompany.end).toBeNull()
    expect(optimisticCompany.isComplete).toBe(true)
    expect(optimisticCompany.joined).toBe('2022-06-01T00:00:00.000Z')
  })
})
