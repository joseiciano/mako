import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createOptimisticCompany,
  fetchCompanies,
  postCompany,
} from './use-account'

describe('use-account hooks', function useAccountHooksSuite() {
  afterEach(function afterEachTest() {
    vi.restoreAllMocks()
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
    ).rejects.toThrow('Failed to add company')
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
