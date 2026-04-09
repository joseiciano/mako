export const DASHBOARD_SOURCE_OF_TRUTH = {
  frontendPageBehavior:
    'docs/system/system-design/frontend-pages.md#dashboard--account',
  milestoneDefinition: 'docs/product/stories/milestones.md#milestone-2-interview-scheduling--dashboard',
  mvpDirection: 'docs/product/system-pitch.md#mvp',
  apiContracts: 'docs/system/system-design/api-routes.md#interviews',
} as const

export const DASHBOARD_STORY_SCOPE_SPLIT = ['2-1', '2-2', '2-3', '2-4'] as const

export const DASHBOARD_INTERVIEW_CONTRACT_DEPENDENCY_GATES = [
  'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-4-interview-shared-contracts-and-module-wiring.md',
  'docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-6-interview-list-route-get-api-interviews.md',
] as const

export const DASHBOARD_ALLOWED_DATA_ROUTES = {
  account: '/api/account',
  upcomingInterviews: '/api/interviews?status=scheduled',
} as const

export const DASHBOARD_QUICK_STATS_ACCOUNT_FIELDS = [
  'credits',
  'freeStandardInterviews',
  'freeAiInterviews',
] as const

export const DASHBOARD_UPCOMING_INTERVIEW_API_FIELDS = [
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
] as const

export const DASHBOARD_OUT_OF_SCOPE_ROUTES = [
  '/interviews/new',
  '/interviews',
] as const

export const DASHBOARD_OUT_OF_SCOPE_ACTIONS = [
  'cancelInterview',
] as const
