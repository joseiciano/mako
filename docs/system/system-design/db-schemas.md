## Migration Workflow

All schema changes must be created as versioned raw SQL migrations in:

- `packages/shared-backend/migrations/*.sql`

Use the migration scripts to keep a consistent workflow:

1. Create a migration file:

```bash
pnpm db:migration:create -- <migration_name>
```

2. Apply pending migrations to a Postgres instance:

```bash
DATABASE_URL=<postgres_connection_string> pnpm db:migrate
```

Migrations are tracked in the `schema_migrations` table.

### User

The `"user"` schema extends the default **Better Auth** requirements to include platform-specific metadata.

- **`id`**: `uuid` (Primary Key) - Unique identifier for the user.
- **`email`**: `text` (Unique) - User's email address.
- **`name`**: `text` - Full name of the user.
- **`emailVerified`**: `boolean` (Default: false) - Whether the email address has been verified.
- **`image`**: `text` (Optional) - User profile image URL.
- **`credits`**: `integer` (Default: 0) - Current balance of interview credits.
- **`free_standard_interviews`**: `integer` (Default: 1) - Remaining free standard (random) peer interviews.
- **`free_ai_interviews`**: `integer` (Default: 1) - Remaining free AI-led interviews.
- **`companies`**: `boolean` (Default: false) - Flag indicating if the user is authorized to conduct interviews.
- **`createdAt`**: `timestamptz` - Account creation date.
- **`updatedAt`**: `timestamptz` - Last profile update.
- **`deleted_at`**: `timestamptz`

Constraints:

- `email` is unique.
- `credits >= 0`
- `free_standard_interviews >= 0`
- `free_ai_interviews >= 0`

### Session

- **`id`**: `uuid` (Primary Key)
- **`userId`**: `uuid` (Foreign Key -> `"user".id`, On Delete Cascade)
- **`token`**: `text` (Unique)
- **`expiresAt`**: `timestamptz`
- **`ipAddress`**: `text` (Optional)
- **`userAgent`**: `text` (Optional)
- **`createdAt`**: `timestamptz`
- **`updatedAt`**: `timestamptz`

Indexes:

- `idx_session_user_id` on (`userId`)

### Account

- **`id`**: `uuid` (Primary Key)
- **`userId`**: `uuid` (Foreign Key -> `"user".id`, On Delete Cascade)
- **`accountId`**: `text` - Provider account identifier.
- **`providerId`**: `text` - Provider name such as `credential`.
- **`accessToken`**: `text` (Optional)
- **`refreshToken`**: `text` (Optional)
- **`accessTokenExpiresAt`**: `timestamptz` (Optional)
- **`refreshTokenExpiresAt`**: `timestamptz` (Optional)
- **`scope`**: `text` (Optional)
- **`idToken`**: `text` (Optional)
- **`password`**: `text` (Optional) - Password hash for email/password authentication.
- **`createdAt`**: `timestamptz`
- **`updatedAt`**: `timestamptz`

Indexes:

- `idx_account_user_id` on (`userId`)

### Verification

- **`id`**: `uuid` (Primary Key)
- **`identifier`**: `text`
- **`value`**: `text`
- **`expiresAt`**: `timestamptz`
- **`createdAt`**: `timestamptz`
- **`updatedAt`**: `timestamptz`

Indexes:

- `idx_verification_identifier` on (`identifier`)

### user_companies

Canonical mutable employment-history records owned by a user. Complete active records may be selected when submitting an interviewer application; the application stores a separate immutable JSON snapshot.

- **`id`**: `uuid` (Primary Key)
- **`user_id`**: `uuid` (Foreign Key -> `"user".id`, On Delete Cascade)
- **`company`**: `string` (lowercase) - name of company
- **`role`**: `text` (Nullable for migrated legacy rows) - employment role/title. New canonical creates require a non-blank role.
- **`joined`**: `timestamptz` - employment start value; API contracts expose its UTC date as `start` (`YYYY-MM-DD`).
- **`ended_at`**: `timestamptz` (Optional) - employment end value stored at UTC midnight and exposed as date-only `end`; null means the role is current.
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`
- **`deleted_at`**: `timestamptz`

Constraints:

- `company = lower(company)`
- `role IS NULL OR btrim(role) <> ''`
- `ended_at IS NULL OR (ended_at AT TIME ZONE 'UTC')::date >= (joined AT TIME ZONE 'UTC')::date` — compare `ended_at` and `joined` as UTC calendar dates using the exact UTC-date expression `(ended_at AT TIME ZONE 'UTC')::date >= (joined AT TIME ZONE 'UTC')::date`: extract both timestamps in UTC and compare their date-only `YYYY-MM-DD` values, never their local-time components, so a valid same-day start/end or an end on the UTC date equal to the join date is accepted regardless of the timezone the app/user is in.

Behavior:

- A row with `role IS NULL` is a preserved legacy record and is incomplete for new interviewer applications until updated.
- Updating or soft-deleting a row never rewrites an existing application snapshot and never grants or revokes `"user".companies` eligibility.
- Individual employment rows do not carry verification status in the MVP.

Indexes:

- `idx_user_companies_user_id` on (`user_id`)
- `idx_user_companies_user_active_ordered` on (`user_id`, `joined DESC`, `created_at DESC`, `id ASC`) WHERE `deleted_at IS NULL` — supports the `getCompaniesByUserId` ordering for active records.

### User_Interviewer_Applications

Used to track the verification flow for users wanting to become interviewers.

- **`id`**: `uuid` (Primary Key)
- **`user_id`**: `uuid` (Foreign Key -> `"user".id`) - The applicant.
- **`email`**: `text` - Contact email for the application.
- **`employment_history`**: `jsonb` - Immutable submission-time snapshots shaped as `{ sourceCompanyId: uuid | null, company: string, role: string, start: YYYY-MM-DD, end: YYYY-MM-DD | null }[]`; persisted/admin read contracts permit null only for legacy applications, while every new submission requires a non-null source record UUID.
- **`status`**: `text` with CHECK (`pending`, `approved`, `rejected`) - Current state of the application.
- **`reviewed_by`**: `uuid` (Optional, Foreign Key -> `"user".id`) - Admin who reviewed the application.
- **`reviewed_at`**: `timestamptz` (Optional) - Decision timestamp; null while pending. Added in Story 7.8, not yet present in the current schema.
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

Constraints and indexes:

- At most one pending-or-approved application exists per user (one partial unique index on `user_id` where `status IN ('pending', 'approved')`). This also prevents a pending and approved row from coexisting during an approval/submission race. Rejected users may reapply with a new row.
- `employment_history` must be a top-level JSON array. Field-level snapshot validation remains an application-layer responsibility.
- `idx_user_interviewer_applications_active_user` is the unique partial lifecycle index on `user_id WHERE status IN ('pending', 'approved')`.
- `idx_user_interviewer_applications_user_latest` on `(user_id, created_at DESC, id DESC)` supports deterministic applicant status lookup.
- `idx_user_interviewer_applications_status_created` on `(status, created_at ASC, id ASC)` supports status-filtered admin review lists.

Verification behavior:

- Manual admin review of this immutable snapshot is the MVP employment-verification mechanism.
- Approval sets `"user".companies = true` in the same guarded decision transaction. Individual employment rows are not marked verified.
- Subsequent profile edits do not mutate this snapshot and do not automatically revoke eligibility.
- The stored application email is a user-supplied contact snapshot that may differ from the account email; later account-email changes do not rewrite it.

### Interviews

Core entity for tracking mock sessions and AI-led interviews.

- **`id`**: `uuid` (Primary Key)
- **`scheduler_id`**: `uuid` (Foreign Key -> `"user".id`) - Interview participant "A". For direct route-created sessions this is the authenticated creator; for matcher-created peer-to-peer sessions this is assigned deterministically (see rule below).
- **`scheduler_alias`**: `text` - Anonymous name for the scheduler during the session.
- **`interviewer_id`**: `uuid` (Optional, Foreign Key -> `"user".id`) - Interview participant "B" for peer-to-peer sessions; null for AI-led sessions in Milestone 2.
- **`interviewer_alias`**: `text` - Anonymous name for the interviewer during the session.
- **`type`**: `enum` ('system_design', 'coding', 'behavioral') - Category of the interview.
- **`mode`**: `enum` ('peer_to_peer', 'ai_led') - Whether it's a mock with another user or AI.
- **`tier`**: `enum` ('standard', 'premium') - In Milestone 2, this is a policy label/input (quota/limits), not a separate creation flow. Verified-interviewer assignment behavior is future milestone scope.
- **`status`**: `enum` ('scheduled', 'ongoing', 'completed', 'cancelled')
- **`scheduled_at`**: `timestamptz` - Time the interview is set to start.
- **`realtime_session_id`**: `text` (Optional) - Cloudflare Realtime session identifier persisted/reused by join-time provisioning (`POST /api/interviews/:id/provision`).
- **`excalidraw_room_id`**: `text` (Optional) - Excalidraw live collaboration room ID persisted/reused by join-time provisioning.
- **`excalidraw_key`**: `text` (Optional) - Excalidraw room key persisted/reused with the room ID for whiteboard live collaboration.
- **`recording_url`**: `text` (Optional) - URL for the session recording in R2.
- **`screenshot_urls`**: `jsonb` (Optional) - Array of URLs for whiteboard captures or session screenshots stored in R2; post-interview artifact analysis/reporting is Milestone 5 scope.
- **`feedback`**: `jsonb` (Optional) - Stores AI-generated feedback, scores, and improvement areas.
- **`started_at`**: `timestamptz` (Optional) - When the interview transitioned to ongoing; persisted boundary for the 60-minute session timer.
- **`expires_at`**: `timestamptz` (Optional) - 60-minute session expiration timestamp; sourced from `started_at + 60 minutes`.
- **`warning_at`**: `timestamptz` (Optional) - 5-minute warning timestamp; sourced from `started_at + 55 minutes`.
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

Matcher-created role assignment rule (Standard peer-to-peer):

- Order the two matched `availability_requests` by `(created_at ASC, id ASC)`.
- First request's `user_id` -> `interviews.scheduler_id`.
- Second request's `user_id` -> `interviews.interviewer_id`.
- This rule must be stable so reruns over the same input state always assign roles identically.

Indexes:

- `idx_interviews_scheduler_scheduled_at_id` on (`scheduler_id`, `scheduled_at`, `id`) for unfiltered participant history ordering.
- `idx_interviews_interviewer_scheduled_at_id` on (`interviewer_id`, `scheduled_at`, `id`) for unfiltered participant history ordering when the current user is the interviewer.
- `idx_interviews_scheduler_status_scheduled_at_id` on (`scheduler_id`, `status`, `scheduled_at`, `id`) for participant-scoped list filtering and deterministic pagination.
- `idx_interviews_interviewer_status_scheduled_at_id` on (`interviewer_id`, `status`, `scheduled_at`, `id`) for participant-scoped list filtering and deterministic pagination when the current user is the interviewer.

Query readiness notes:

- Participant-scoped interview lists should use deterministic ordering `ORDER BY scheduled_at ASC, id ASC`.
- Unfiltered participant history relies on the `(participant_id, scheduled_at, id)` indexes above.
- Status-filtered participant lists (for example dashboard `status=scheduled`) rely on the `(participant_id, status, scheduled_at, id)` indexes above.
- Participant-authorized cancellation by interview id relies on the primary key lookup on `id`; secondary indexes above are for list-path readiness.

### notification_outbox_events

Durable producer outbox for post-commit notification transport hand-off.

- **`idempotency_key`**: `text` (Primary Key)
- **`event_type`**: `text`
- **`event_payload`**: `jsonb`
- **`status`**: `text` with CHECK (`pending`, `dispatched`, `failed`)
- **`dispatch_attempts`**: `integer` (Default: 0)
- **`last_dispatch_attempted_at`**: `timestamptz` (Optional)
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

Indexes:

- `idx_notification_outbox_events_pending` on (`created_at`) WHERE `status = 'pending'`

### notification_processing_checkpoints

Durable idempotency checkpoints for per-side-effect processing progress.

- **`idempotency_key`**: `text`
- **`checkpoint_key`**: `text`
- **`created_at`**: `timestamptz`

Constraints:

- Composite primary key on (`idempotency_key`, `checkpoint_key`)

### notification_reminder_schedules

Persisted reminder transport schedule for delayed reminder delivery/suppression flows.

- **`id`**: `uuid` (Primary Key)
- **`interview_id`**: `uuid` (Foreign Key -> `interviews.id`)
- **`idempotency_key`**: `text`
- **`reminder_due_at`**: `timestamptz`
- **`status`**: `text` with CHECK (`pending`, `suppressed`, `dispatched`)
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

Indexes:

- `idx_notification_reminder_schedules_due` on (`reminder_due_at`) WHERE `status = 'pending'`
- `idx_notification_reminder_schedules_idempotency_key` unique on (`idempotency_key`)
- `idx_notification_reminder_schedules_active_interview` unique on (`interview_id`) WHERE `status = 'pending'`

### Availability_Requests

Groups a set of time blocks where a user is available for matching, with a maximum quota.

- **`id`**: `uuid` (Primary Key)
- **`user_id`**: `uuid` (Foreign Key -> `"user".id`, On Delete Cascade)
- **`max_matches`**: `integer` - Maximum number of interviews the user wants for this request.
- **`current_matches`**: `integer` (Default: 0) - Number of matches already made for this request.
- **`interview_type`**: `text` with CHECK (`system_design`, `coding`, `behavioral`)
- **`status`**: `text` with CHECK (`active`, `fulfilled`, `cancelled`)
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

Constraints:

- `max_matches > 0`
- `current_matches >= 0`

Indexes:

- `idx_availability_requests_user_id_status` on (`user_id`, `status`)

### Availability_Slots

Individual 60-minute time blocks associated with an Availability Request.

- **`id`**: `uuid` (Primary Key)
- **`request_id`**: `uuid` (Foreign Key -> `availability_requests.id`, On Delete Cascade)
- **`start_time`**: `timestamptz` - The start of the 60-minute window.
- **`end_time`**: `timestamptz` - The end of the 60-minute window.
- **`status`**: `text` with CHECK (`available`, `matched`, `cancelled`)
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

Constraints:

- `availability_slots_time_window_check`: `start_time < end_time`
- `availability_slots_exact_60_minutes_check`: `end_time = start_time + interval '60 minutes'`
- `availability_slots_unique_window`: unique (`request_id`, `start_time`, `end_time`)

Indexes:

- `idx_availability_slots_request_id_status` on (`request_id`, `status`)

### Credit_Transactions

Logs for financial history and credit fulfillment via Stripe.

- **`id`**: `uuid` (Primary Key)
- **`user_id`**: `uuid` (Foreign Key -> `"user".id`)
- **`stripe_payment_intent_id`**: `text` (Unique) - Reference for the Stripe transaction.
- **`amount`**: `integer` - Amount paid in cents.
- **`credits_granted`**: `integer` - Number of credits added to the user's balance.
- **`status`**: `text` - Transaction status ('succeeded', 'pending', 'failed').
- **`created_at`**: `timestamptz`

Constraints:

- `stripe_payment_intent_id` is unique across all rows.
- `credits_granted >= 0`.
- `amount >= 0`.
- `status IN ('succeeded', 'pending', 'failed')`.

Indexes:

- `idx_credit_transactions_stripe_payment_intent_id` unique on (`stripe_payment_intent_id`)
- `idx_credit_transactions_user_id_created_at` on (`user_id`, `created_at DESC`)
