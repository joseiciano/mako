import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InterviewerApplicationSmart } from './interviewer-application-smart'

vi.mock('@tanstack/react-router', function mockRouter() {
  return {
    Link: function Link(props: { to: string; children: ReactNode }) {
      return <a href={props.to}>{props.children}</a>
    },
  }
})

const idA = '11111111-1111-4111-8111-111111111111'
const idB = '22222222-2222-4222-8222-222222222222'
const idC = '44444444-4444-4444-8444-444444444444'

function company(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    userId: '99999999-9999-4999-8999-999999999999',
    company: name,
    role: 'Engineer',
    start: '2020-01-01',
    end: null,
    isComplete: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    joined: '2020-01-01T00:00:00.000Z',
    ...extra,
  }
}

function application(status: 'pending' | 'approved' | 'rejected', names = ['Snapshot Co']) {
  return {
    applicationId: '33333333-3333-4333-8333-333333333333',
    email: 'submitted@example.com',
    status,
    createdAt: '2026-08-07T20:00:00.000Z',
    updatedAt: '2026-08-07T20:00:00.000Z',
    employmentHistory: names.map(function toEntry(name) {
      return { sourceCompanyId: idA, company: name, role: 'Lead', start: '2019-02-03', end: null }
    }),
  }
}

type Routes = {
  status: () => Response | Promise<Response>
  companies?: unknown[]
  apply?: (body: unknown) => Response | Promise<Response>
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch(routes: Routes) {
  const fetchMock = vi.fn(async function impl(input: RequestInfo | URL, init?: RequestInit) {
    const url = String(input)
    if (url.includes('/api/interviewer/status')) return routes.status()
    if (url.includes('/api/interviewer/apply')) {
      return routes.apply!(JSON.parse(init?.body as string))
    }
    if (url.includes('/api/companies')) return json({ companies: routes.companies ?? [] })
    if (url.includes('/api/account')) {
      return json({
        id: 'user-1',
        email: 'account@example.com',
        displayName: 'Me',
        credits: 0,
        freeStandardInterviews: 0,
        freeAiInterviews: 0,
        isVerifiedInterviewer: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    }
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderSmart() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <InterviewerApplicationSmart />
    </QueryClientProvider>,
  )
  return queryClient
}

function applyBodies(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls
    .filter(function isApply(call) {
      return String(call[0]).includes('/api/interviewer/apply')
    })
    .map(function body(call) {
      return JSON.parse(call[1]?.body as string)
    })
}

const records = [
  company(idA, 'Acme'),
  company(idB, 'Globex', { role: null, isComplete: false }),
  company(idC, 'Initech'),
]

describe('InterviewerApplicationSmart', function suite() {
  beforeEach(function setup() {
    vi.unstubAllGlobals()
  })
  afterEach(function teardown() {
    vi.unstubAllGlobals()
  })

  it('shows a loading state before status resolves', function run() {
    stubFetch({ status: function never() { return new Promise<Response>(function noop() {}) } })
    renderSmart()
    expect(screen.getByRole('status').textContent).toContain('Loading application status')
    expect(screen.queryByRole('button', { name: 'Submit application' })).toBeNull()
  })

  it('shows an error with retry when status fails', async function run() {
    let calls = 0
    stubFetch({
      status: function status() {
        calls += 1
        return calls === 1 ? json({ error: 'Status down' }, 500) : json({ application: null })
      },
      companies: records,
    })
    renderSmart()
    expect((await screen.findByRole('alert')).textContent).toContain('Status down')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Submit application' })).toBeTruthy()
  })

  it('shows the form with prefilled editable email when no application exists', async function run() {
    stubFetch({ status: function s() { return json({ application: null }) }, companies: records })
    renderSmart()
    const email = (await screen.findByLabelText('Contact email')) as HTMLInputElement
    await waitFor(function prefilled() {
      expect(email.value).toBe('account@example.com')
    })
    fireEvent.change(email, { target: { value: 'other@example.com' } })
    expect(email.value).toBe('other@example.com')
  })

  it('allows only complete records and links incomplete ones to settings', async function run() {
    stubFetch({ status: function s() { return json({ application: null }) }, companies: records })
    renderSmart()
    await screen.findByRole('checkbox', { name: /Acme/ })
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.getByText(/Needs details/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Complete this record/ }).getAttribute('href')).toBe(
      '/settings/profile',
    )
  })

  it('shows the empty-history state', async function run() {
    stubFetch({ status: function s() { return json({ application: null }) }, companies: [] })
    renderSmart()
    expect(await screen.findByRole('link', { name: /employment history in settings/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Submit application' })).toBeNull()
  })

  it('requires a selection and moves focus to the first checkbox', async function run() {
    const fetchMock = stubFetch({
      status: function s() { return json({ application: null }) },
      companies: records,
    })
    renderSmart()
    await screen.findByRole('checkbox', { name: /Acme/ })
    await waitFor(function ready() {
      expect((screen.getByLabelText('Contact email') as HTMLInputElement).value).toBe('account@example.com')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))
    expect(await screen.findByText('Select at least one complete employment record.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: /Acme/ }))
    expect(applyBodies(fetchMock)).toHaveLength(0)
  })

  it('rejects an invalid contact email and focuses it', async function run() {
    stubFetch({ status: function s() { return json({ application: null }) }, companies: records })
    renderSmart()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Acme/ }))
    fireEvent.change(screen.getByLabelText('Contact email'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))
    expect(await screen.findByText('Enter a valid contact email.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('Contact email'))
  })

  it('submits IDs in profile order with the edited email, then shows the server snapshot', async function run() {
    const fetchMock = stubFetch({
      status: function s() { return json({ application: null }) },
      companies: records,
      apply: function apply() {
        return json({ application: application('pending', ['Server Snapshot']) }, 201)
      },
    })
    renderSmart()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Initech/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Acme/ }))
    fireEvent.change(screen.getByLabelText('Contact email'), { target: { value: 'edited@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(await screen.findByText('Server Snapshot')).toBeTruthy()
    expect(applyBodies(fetchMock)).toEqual([
      { email: 'edited@example.com', employmentRecordIds: [idA, idC] },
    ])
    expect(screen.getByTestId('application-status').textContent).toBe('Pending review')
    expect(screen.queryByRole('button', { name: 'Submit application' })).toBeNull()
    expect(screen.getByText('2019-02-03 — Present')).toBeTruthy()
  })

  it('prevents duplicate submission while pending', async function run() {
    let release: (value: Response) => void = function noop() {}
    const fetchMock = stubFetch({
      status: function s() { return json({ application: null }) },
      companies: records,
      apply: function apply() {
        return new Promise<Response>(function hold(resolve) {
          release = resolve
        })
      },
    })
    renderSmart()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Acme/ }))
    await waitFor(function ready() {
      expect((screen.getByLabelText('Contact email') as HTMLInputElement).value).not.toBe('')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))
    const busy = (await screen.findByRole('button', { name: 'Submitting...' })) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    fireEvent.submit(busy.closest('form') as HTMLFormElement)
    expect(applyBodies(fetchMock)).toHaveLength(1)
    expect((screen.getByRole('checkbox', { name: /Acme/ }) as HTMLInputElement).checked).toBe(true)
    release(json({ application: application('pending') }, 201))
    await screen.findByTestId('application-status')
  })

  it('keeps selections and email after a retryable failure and allows retry', async function run() {
    let attempt = 0
    const fetchMock = stubFetch({
      status: function s() { return json({ application: null }) },
      companies: records,
      apply: function apply() {
        attempt += 1
        return attempt === 1
          ? json({ error: 'Unexpected interviewer application error.' }, 500)
          : json({ application: application('pending') }, 201)
      },
    })
    renderSmart()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Acme/ }))
    fireEvent.change(screen.getByLabelText('Contact email'), { target: { value: 'keep@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Unexpected interviewer application error.')
    expect((screen.getByRole('checkbox', { name: /Acme/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Contact email') as HTMLInputElement).value).toBe('keep@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Retry submission' }))
    await screen.findByTestId('application-status')
    expect(applyBodies(fetchMock)).toEqual([
      { email: 'keep@example.com', employmentRecordIds: [idA] },
      { email: 'keep@example.com', employmentRecordIds: [idA] },
    ])
  })

  it('converges to canonical status on 409', async function run() {
    let created = false
    stubFetch({
      status: function s() {
        return json({ application: created ? application('approved', ['Canonical Co']) : null })
      },
      companies: records,
      apply: function apply() {
        created = true
        return json({ error: 'Application already exists' }, 409)
      },
    })
    renderSmart()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Acme/ }))
    await waitFor(function ready() {
      expect((screen.getByLabelText('Contact email') as HTMLInputElement).value).not.toBe('')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))
    expect(await screen.findByText('Canonical Co')).toBeTruthy()
    expect(screen.getByTestId('application-status').textContent).toBe('Approved')
    expect(screen.queryByRole('button', { name: 'Submit application' })).toBeNull()
  })

  it('shows pending status without a form', async function run() {
    stubFetch({ status: function s() { return json({ application: application('pending') }) }, companies: records })
    renderSmart()
    expect(await screen.findByText('Snapshot Co')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Submit/ })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('shows approved status without a form', async function run() {
    stubFetch({ status: function s() { return json({ application: application('approved') }) }, companies: records })
    renderSmart()
    expect((await screen.findByTestId('application-status')).textContent).toBe('Approved')
    expect(screen.queryByRole('button', { name: /Submit/ })).toBeNull()
  })

  it('shows rejected status and re-enables a new submission', async function run() {
    const fetchMock = stubFetch({
      status: function s() { return json({ application: application('rejected') }) },
      companies: records,
      apply: function apply() {
        return json({ application: application('pending', ['Second Try']) }, 201)
      },
    })
    renderSmart()
    expect((await screen.findByTestId('application-status')).textContent).toBe('Rejected')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Acme/ }))
    await waitFor(function ready() {
      expect((screen.getByLabelText('Contact email') as HTMLInputElement).value).not.toBe('')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))
    expect(await screen.findByText('Second Try')).toBeTruthy()
    expect(applyBodies(fetchMock)).toHaveLength(1)
    expect(screen.getByTestId('application-status').textContent).toBe('Pending review')
  })

  it('shows an error with retry when employment history fails to load', async function run() {
    const fetchMock = vi.fn(async function impl(input: RequestInfo | URL) {
      const url = String(input)
      if (url.includes('/api/interviewer/status')) return json({ application: null })
      if (url.includes('/api/companies')) return json({ error: 'Companies down' }, 500)
      return json({}, 404)
    })
    vi.stubGlobal('fetch', fetchMock)
    renderSmart()
    expect((await screen.findByRole('alert')).textContent).toContain('Companies down')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
