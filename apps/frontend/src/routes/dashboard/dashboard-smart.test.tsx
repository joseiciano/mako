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
      data: createAccountFixture(),
    })
    mockScheduledInterviewsQuery({
      data: [],
    })

    const html = renderToString(<DashboardSmart />)

    expect(html).toContain('No upcoming interviews scheduled.')
    expect(html).toContain('Quick stats')
    expect(html).toContain('Credits')
    expect(html).toContain('Free Standard Interviews')
    expect(html).toContain('Free AI Interviews')
    expect(html).toContain('8')
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

    expect(html).toContain('You have ')
    expect(html).toContain('upcoming interviews.')
    expect(html).toContain('Credits')
    expect(html).toContain('Free Standard Interviews')
    expect(html).toContain('Free AI Interviews')
    expect(html).toContain('System Design')
    expect(html).toContain('Peer to Peer')
    expect(html).toContain('Scheduled')
    expect(html).toContain('Apr 10, 2026, 10:30 AM UTC')
    expect(html).toContain('Interviewer-Green')
    expect(html).toContain('Scheduler-Orange')
  })

  it('renders disabled details fallback when interview details route is unavailable', function run() {
    mockAccountQuery({
      data: createAccountFixture(),
    })
    mockScheduledInterviewsQuery({
      data: [createInterviewFixture()],
    })

    const html = renderToString(<DashboardSmart />)

    expect(html).toContain('Details coming soon')
    expect(html).not.toContain('View details')
    expect(html).not.toContain('/interviews/11111111-1111-4111-8111-111111111111')
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

function createAccountFixture() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'demo@mako.dev',
    displayName: 'Demo Candidate',
    credits: 8,
    freeStandardInterviews: 1,
    freeAiInterviews: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
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
