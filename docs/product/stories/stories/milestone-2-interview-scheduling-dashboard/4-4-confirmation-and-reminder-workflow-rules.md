# Story 4.4: Confirmation and Reminder Workflow Rules

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Define deterministic confirmation and reminder behavior for created/matched interviews after successful commit.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-2-notification-event-contract-and-producer-ownership.md`
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/4-3-notification-transport-reliability-and-idempotency.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/system/system-design/diagrams.md`
- `docs/system/system-design/api-routes.md`

## What Needs to Be Done

### 1. Confirmation trigger behavior
- [ ] On `interview.created` or `interview.match.created`, send confirmation notifications only after successful commit.
- [ ] Keep confirmation orchestration out of transaction scope.

### 2. Reminder scheduling behavior
- [ ] Schedule reminder notifications for 30 minutes before `interview.scheduled_at` when `interview.status = 'scheduled'`.
- [ ] If processing-time window is less than 30 minutes before `scheduled_at`, suppress reminder scheduling.
- [ ] If `scheduled_at` is in the past, suppress reminder scheduling.

### 3. Timing edge-case rules
- [ ] Treat AI immediate sessions (`scheduled_at` effectively now/near-now) as confirmation-only unless a valid future reminder window exists.
- [ ] Ensure reminder scheduling logic is deterministic and based on server-side timestamp comparisons (ISO UTC semantics).

### 4. Recipient and participant behavior
- [ ] Define recipient behavior by event mode:
  - AI-led created sessions: scheduler participant notification path
  - Matcher-created peer-to-peer sessions: both participants according to `scheduler_id` and `interviewer_id`
- [ ] Keep recipient semantics aligned with participant role ownership in:
  - `docs/system/system-design/db-schemas.md`
  - `docs/system/system-design/matching-tiers.md`

### 5. Workflow validation coverage
- [ ] Add/update tests for:
  - confirmation on create/match
  - reminder scheduling exactly at valid 30-minute lead windows
  - suppression for late/past windows
  - AI immediate session reminder suppression behavior


## End Goal
Create/match confirmations and 30-minute reminders are specified with deterministic timing and recipient rules, including clear suppression behavior for immediate or past-due windows.
