import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApplicationDetailQueryKey } from '#/hooks/use-admin-reviews'
import { authSessionQueryKey } from '#/hooks/use-auth'
import { AdminReview } from './admin-review-smart'

const navigateMock = vi.hoisted(function createNavigateMock() {
  return vi.fn()
})

vi.mock('@tanstack/react-router', function mockRouter() {
  return {
    useNavigate: function useNavigate() {
      return navigateMock
    },
  }
})

const idA = '11111111-1111-4111-8111-111111111111'
const idB = '22222222-2222-4222-8222-222222222222'
const userA = '33333333-3333-4333-8333-333333333333'
const userB = '44444444-4444-4444-8444-444444444444'

function summary(applicationId: string, userId: string, name: string, isAccountDeleted = false) {
  return {
    applicationId,
    applicant: { userId, name, email: `${name.toLowerCase()}@example.com`, isAccountDeleted },
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    reviewedAt: null,
  }
}

function detail(applicationId: string, userId: string, name: string, isAccountDeleted = false) {
  return {
    ...summary(applicationId, userId, name, isAccountDeleted),
    employmentHistory: [
      { sourceCompanyId: idA, company: 'acme', role: 'Engineer', start: '2020-01-01', end: null },
    ],
    reviewedBy: null,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>

let queryClient: QueryClient
let fetchMock: ReturnType<typeof vi.fn>

function installFetch(routes: {
  list?: Route
  detail?: Route
  decide?: Route
}) {
  fetchMock = vi.fn(function fakeFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = String(input)
    const method = init?.method ?? 'GET'

    if (method === 'PATCH') {
      return Promise.resolve((routes.decide ?? (() => json({}, 500)))(url, init))
    }

    if (url.includes('/admin/applications?')) {
      return Promise.resolve((routes.list ?? (() => json({}, 500)))(url, init))
    }

    return Promise.resolve((routes.detail ?? (() => json({}, 500)))(url, init))
  })
  vi.stubGlobal('fetch', fetchMock)
}

function listResponse(applications: unknown[], hasMore = false, offset = 0) {
  return json({ applications, pagination: { limit: 25, offset, hasMore } })
}

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminReview />
    </QueryClientProvider>,
  )
}

beforeEach(function setup() {
  navigateMock.mockReset()
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})

afterEach(function teardown() {
  vi.unstubAllGlobals()
})

describe('AdminReview smart component', function suite() {
  it('renders the pending list by default and requests the shared query shape', async function run() {
    installFetch({ list: () => listResponse([summary(idA, userA, 'Alice')]) })
    renderPage()

    expect(screen.getByText('Loading applications...')).toBeInTheDocument()
    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toHaveValue('pending')
    expect(screen.getByText('Select an application to review.')).toBeInTheDocument()

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/admin/applications?status=pending&limit=25&offset=0')
  })

  it('shows the empty state', async function run() {
    installFetch({ list: () => listResponse([]) })
    renderPage()

    expect(await screen.findByText('No pending applications.')).toBeInTheDocument()
  })

  it('shows an error state with a retry path', async function run() {
    let calls = 0
    installFetch({
      list: () => {
        calls += 1
        return calls <= 2 ? json({ error: 'Boom' }, 500) : listResponse([summary(idA, userA, 'Alice')])
      },
    })
    renderPage()

    expect(await screen.findByText('Boom', {}, { timeout: 4000 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Alice')).toBeInTheDocument()
  })

  it('refetches with the chosen status and resets the offset', async function run() {
    installFetch({ list: () => listResponse([summary(idA, userA, 'Alice')], true) })
    renderPage()
    await screen.findByText('Alice')

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(function check() {
      expect(fetchMock.mock.calls.some(function match(call) {
        return String(call[0]).includes('offset=25')
      })).toBe(true)
    })

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'approved' } })
    await waitFor(function check() {
      const last = String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0])
      expect(last).toContain('status=approved&limit=25&offset=0')
    })
  })

  it('paginates with previous and next controls', async function run() {
    installFetch({ list: (url) => listResponse([summary(idA, userA, 'Alice')], !url.includes('offset=25'), url.includes('offset=25') ? 25 : 0) })
    renderPage()
    await screen.findByText('Alice')

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(function check() {
      expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    await waitFor(function check() {
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    })
  })

  it('renders application detail when selected and a detail error with retry', async function run() {
    let detailCalls = 0
    installFetch({
      list: () => listResponse([summary(idA, userA, 'Alice')]),
      detail: () => {
        detailCalls += 1
        return detailCalls <= 2 ? json({ error: 'Detail failed' }, 500) : json({ application: detail(idA, userA, 'Alice') })
      },
    })
    renderPage()
    fireEvent.click(await screen.findByText('Alice'))

    expect(await screen.findByText('Detail failed', {}, { timeout: 4000 })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0])
    expect(await screen.findByText(/Engineer at acme/)).toBeInTheDocument()
  })

  it('requires confirmation, then updates the detail cache, invalidates lists and clears selection', async function run() {
    let listCalls = 0
    let releaseDecision: () => void = () => {}
    installFetch({
      list: () => {
        listCalls += 1
        return listCalls === 1 ? listResponse([summary(idA, userA, 'Alice')]) : listResponse([])
      },
      detail: () => json({ application: detail(idA, userA, 'Alice') }),
      decide: () =>
        new Promise<Response>(function hold(resolve) {
          releaseDecision = function release() {
            resolve(json({ application: { ...detail(idA, userA, 'Alice'), status: 'approved' } }))
          }
        }),
    })
    renderPage()
    fireEvent.click(await screen.findByText('Alice'))
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))

    expect(fetchMock.mock.calls.some(function isPatch(call) {
      return call[1]?.method === 'PATCH'
    })).toBe(false)
    expect(screen.getByText(/Are you sure you want to approve/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('button', { name: 'Submitting...' })).toBeDisabled()
    releaseDecision()

    expect(await screen.findByText('No pending applications.')).toBeInTheDocument()
    expect(screen.getByText('Select an application to review.')).toBeInTheDocument()

    const patch = fetchMock.mock.calls.find(function isPatch(call) {
      return call[1]?.method === 'PATCH'
    })
    expect(JSON.parse(patch?.[1]?.body as string)).toEqual({ decision: 'approved' })
    expect(
      (queryClient.getQueryData(adminApplicationDetailQueryKey(idA)) as { status: string }).status,
    ).toBe('approved')
  })

  it('lets the admin cancel a confirmation without submitting', async function run() {
    installFetch({
      list: () => listResponse([summary(idA, userA, 'Alice')]),
      detail: () => json({ application: detail(idA, userA, 'Alice') }),
    })
    renderPage()
    fireEvent.click(await screen.findByText('Alice'))
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(function isPatch(call) {
      return call[1]?.method === 'PATCH'
    })).toBe(false)
  })

  it('shows a conflict state on 409 and refetches list and detail without clearing selection', async function run() {
    installFetch({
      list: () => listResponse([summary(idA, userA, 'Alice')]),
      detail: () => json({ application: detail(idA, userA, 'Alice') }),
      decide: () => json({ error: 'Already decided' }, 409),
    })
    renderPage()
    fireEvent.click(await screen.findByText('Alice'))
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    const callsBefore = fetchMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText(/already decided or changed/)).toBeInTheDocument()
    await waitFor(function check() {
      const refetches = fetchMock.mock.calls.slice(callsBefore).filter(function isGet(call) {
        return (call[1]?.method ?? 'GET') === 'GET'
      })
      expect(refetches.length).toBeGreaterThanOrEqual(2)
    })
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.queryByText(/Are you sure/)).not.toBeInTheDocument()
  })

  it('disables approve but allows reject for deleted applicants', async function run() {
    installFetch({
      list: () => listResponse([summary(idB, userB, 'Bob', true)]),
      detail: () => json({ application: detail(idB, userB, 'Bob', true) }),
    })
    renderPage()
    fireEvent.click(await screen.findByText('Bob'))

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled()
  })

  it('treats a 401 on the list as session loss and routes to login', async function run() {
    queryClient.setQueryData(authSessionQueryKey, { session: { id: 's' }, user: { id: 'u' } })
    installFetch({ list: () => json({ error: 'Unauthorized' }, 401) })
    renderPage()

    expect(await screen.findByText(/session has expired/)).toBeInTheDocument()
    await waitFor(function check() {
      expect(navigateMock).toHaveBeenCalledWith({ to: '/login', replace: true })
    })
    expect(queryClient.getQueryData(authSessionQueryKey)).toBeNull()
  })

  it('treats a 403 on a decision as revoked admin: dashboard redirect and no cache write', async function run() {
    installFetch({
      list: () => listResponse([summary(idA, userA, 'Alice')]),
      detail: () => json({ application: detail(idA, userA, 'Alice') }),
      decide: () => json({ error: 'Forbidden' }, 403),
    })
    renderPage()
    fireEvent.click(await screen.findByText('Alice'))
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText(/Admin access was revoked/)).toBeInTheDocument()
    await waitFor(function check() {
      expect(navigateMock).toHaveBeenCalledWith({ to: '/dashboard', replace: true })
    })
    expect(queryClient.getQueryData(adminApplicationDetailQueryKey(idA))).toBeUndefined()
    expect(screen.getByText('Select an application to review.')).toBeInTheDocument()
  })
})
