import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardSmart } from './dashboard-smart'

const {
  useAccountMock,
  useScheduledInterviewsMock,
} = vi.hoisted(function createMocks() {
  return {
    useAccountMock: vi.fn(),
    useScheduledInterviewsMock: vi.fn(),
  }
})

vi.mock('#/hooks/use-account', function mockUseAccountModule() {
  return {
    useAccount: useAccountMock,
  }
})

vi.mock(
  '#/hooks/use-scheduled-interviews',
  function mockUseScheduledInterviewsModule() {
    return {
      useScheduledInterviews: useScheduledInterviewsMock,
    }
  },
)

vi.mock('@tanstack/react-router', function mockRouter() {
  return {
    Link: function Link(props: { to: string; params?: Record<string, string>; className?: string; children: unknown }) {
      const href = props.to.replace('$id', props.params?.id ?? '')
      return <a href={href} className={props.className}>{props.children as never}</a>
    },
  }
})

describe('dashboard-smart query state orchestration', function dashboardSmartSuite() {
  beforeEach(function resetMocks() {
    useAccountMock.mockReset()
    useScheduledInterviewsMock.mockReset()
  })

  it('renders loading state while dashboard queries are pending', function run() {
    mockAccountQuery({
      isPending: true,
    })
    mockScheduledInterviewsQuery({
      isPending: false,
      data: [],
    })

    const html = renderToString(<DashboardSmart />)

    expect(html).toContain('Loading dashboard data...')
  })

  it('renders empty state from successful query results', function run() {
    mockAccountQuery({
      data: createAccountFixture({
        credits: 89,
        freeStandardInterviews: 34,
        freeAiInterviews: 21,
      }),
    })
    mockScheduledInterviewsQuery({
      data: [],
    })

    const html = renderToString(<DashboardSmart />)

    expect(html).toContain('No upcoming interviews.')
    expect(html).toMatch(/rp-n">89<\/div><div class="mute">Credits/)
    expect(html).toMatch(/rp-n">34<\/div><div class="mute">Free peer left/)
    expect(html).toMatch(/rp-n">21<\/div><div class="mute">Free AI left/)
  })

  it('renders populated state from successful query results', function run() {
    mockAccountQuery({
      data: createAccountFixture(),
    })
    mockScheduledInterviewsQuery({
      data: [
        createInterviewFixture({
          id: '11111111-1111-4111-8111-111111111111',
          scheduler_id: '11111111-1111-4111-8111-111111111111',
          scheduler_alias: 'Candidate-Blue',
          interviewer_alias: 'Interviewer-Green',
        }),
        createInterviewFixture({
          id: '22222222-2222-4222-8222-222222222222',
          scheduler_id: '33333333-3333-4333-8333-333333333333',
          scheduler_alias: 'Scheduler-Orange',
          interviewer_alias: 'Interviewer-Red',
        }),
      ],
    })

    const html = renderToString(<DashboardSmart />)

    expect(html).toMatch(/rp-n">2<\/div><div class="mute">Upcoming/)
    expect(html).toContain('Peer to Peer')
    const expectedLocalTime = new Date('2026-04-10T10:30:00.000Z').toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    expect(html).toContain(expectedLocalTime)
    expect(html).toContain('Interviewer-Green')
    expect(html).toContain('Scheduler-Orange')
  })

  it('renders open links for each interview', function run() {
    mockAccountQuery({
      data: createAccountFixture(),
    })
    mockScheduledInterviewsQuery({
      data: [createInterviewFixture()],
    })

    const html = renderToString(<DashboardSmart />)

    expect(html).toContain('href="/interviews/11111111-1111-4111-8111-111111111111"')
    expect(html).toContain('>Open</a>')
  })

  it('renders error state when account query fails', function run() {
    mockAccountQuery({
      isError: true,
      error: new Error('Account lookup failed'),
    })
    mockScheduledInterviewsQuery({
      data: [createInterviewFixture()],
    })

    const html = renderToString(<DashboardSmart />)

    expect(html).toContain('Account lookup failed')
  })

  it('renders error state when interview query fails', function run() {
    mockAccountQuery({
      data: createAccountFixture(),
    })
    mockScheduledInterviewsQuery({
      isError: true,
      error: new Error('Unauthorized'),
    })

    const html = renderToString(<DashboardSmart />)

    expect(html).toContain('Unauthorized')
  })

  it('renders fallback error when queries settle without required data', function run() {
    mockAccountQuery({
      data: undefined,
    })
    mockScheduledInterviewsQuery({
      data: [],
    })

    const html = renderToString(<DashboardSmart />)

    expect(html).toContain('Unable to load dashboard.')
  })
})

function mockAccountQuery(overrides: Record<string, unknown>) {
  useAccountMock.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  })
}

function mockScheduledInterviewsQuery(overrides: Record<string, unknown>) {
  useScheduledInterviewsMock.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  })
}

function createAccountFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'demo@mako.dev',
    displayName: 'Demo Candidate',
    credits: 8,
    freeStandardInterviews: 1,
    freeAiInterviews: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function createInterviewFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    scheduler_id: '22222222-2222-4222-8222-222222222222',
    scheduler_alias: 'Candidate-Blue',
    interviewer_id: null,
    interviewer_alias: 'Interviewer-Red',
    type: 'system_design',
    mode: 'peer_to_peer',
    tier: 'standard',
    status: 'scheduled',
    scheduled_at: '2026-04-10T10:30:00.000Z',
    created_at: '2026-04-01T10:00:00.000Z',
    updated_at: '2026-04-01T10:00:00.000Z',
    ...overrides,
  }
}
