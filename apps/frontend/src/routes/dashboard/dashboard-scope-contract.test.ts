import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_ALLOWED_DATA_ROUTES,
  DASHBOARD_INTERVIEW_CONTRACT_DEPENDENCY_GATES,
  DASHBOARD_OUT_OF_SCOPE_ACTIONS,
  DASHBOARD_OUT_OF_SCOPE_ROUTES,
  DASHBOARD_QUICK_STATS_ACCOUNT_FIELDS,
  DASHBOARD_SOURCE_OF_TRUTH,
  DASHBOARD_STORY_SCOPE_SPLIT,
  DASHBOARD_UPCOMING_INTERVIEW_API_FIELDS,
} from './dashboard-scope-contract'

describe('dashboard scope contract lock', function dashboardScopeContractSuite() {
  it('locks the canonical source-of-truth references for dashboard implementation', function run() {
    expect(DASHBOARD_SOURCE_OF_TRUTH).toEqual({
      frontendPageBehavior:
        'docs/system/system-design/frontend-pages.md#dashboard--account',
      milestoneDefinition:
        'docs/product/stories/milestones.md#milestone-2-interview-scheduling--dashboard',
      mvpDirection: 'docs/product/system-pitch.md#mvp',
      apiContracts: 'docs/system/system-design/api-routes.md#interviews',
    })
  })

  it('locks the dashboard story split to 2-1 through 2-4', function run() {
    expect([...DASHBOARD_STORY_SCOPE_SPLIT]).toEqual(['2-1', '2-2', '2-3', '2-4'])
  })

  it('locks dependency gates for finalized interview list contracts', function run() {
    expect([...DASHBOARD_INTERVIEW_CONTRACT_DEPENDENCY_GATES]).toEqual([
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-4-interview-shared-contracts-and-module-wiring.md',
      'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-6-interview-list-route-get-api-interviews.md',
    ])
  })

  it('keeps dashboard data routes limited to account and scheduled interviews', function run() {
    expect(DASHBOARD_ALLOWED_DATA_ROUTES).toEqual({
      account: '/api/account',
      upcomingInterviews: '/api/interviews?status=scheduled',
    })
  })

  it('keeps quick stats limited to credits and free balances', function run() {
    expect([...DASHBOARD_QUICK_STATS_ACCOUNT_FIELDS]).toEqual([
      'credits',
      'freeStandardInterviews',
      'freeAiInterviews',
    ])
  })

  it('requires alias and scheduling fields in upcoming interview list contract', function run() {
    expect([...DASHBOARD_UPCOMING_INTERVIEW_API_FIELDS]).toEqual([
      'id',
      'scheduler_id',
      'scheduler_alias',
      'interviewer_id',
      'interviewer_alias',
      'type',
      'mode',
      'tier',
      'status',
      'scheduled_at',
      'created_at',
      'updated_at',
    ])
  })

  it('keeps create/cancel/history behavior explicitly out of scope', function run() {
    expect([...DASHBOARD_OUT_OF_SCOPE_ROUTES]).toEqual([
      '/interviews/new',
      '/interviews',
    ])

    expect([...DASHBOARD_OUT_OF_SCOPE_ACTIONS]).toEqual(['cancelInterview'])
  })
})
