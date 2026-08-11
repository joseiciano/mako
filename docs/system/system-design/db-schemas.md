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
- **`tier`**: `enum` ('standard', 'premium') - Payment-policy outcome label. In Milestone 2, this is a policy label/input (quota/limits), not a separate creation flow. Premium slot claims now create interviews with `tier = 'premium'` (see `booking_channel` below and the premium claim flow).
- **`booking_channel`**: `text` NOT NULL with CHECK (`ai_direct`, `standard_match`, `verified_interviewer`) - Channel discriminator describing which path created the booking: `ai_direct` (direct AI-led create), `standard_match` (matcher-created peer-to-peer), or `verified_interviewer` (premium slot claim). Contracted to `NOT NULL` in Story 7.11 after the bounded re-backfill verified zero nulls and the fleet drain check passed. Intentionally separate from `tier`; `tier` remains the payment-policy outcome label (`standard`/`premium`), not a channel value.
- **`status`**: `enum` ('scheduled', 'ongoing', 'completed', 'cancelled')
- **`scheduled_at`**: `timestamptz` - Time the interview is set to start.
- **`realtime_session_id`**: `text` (Optional) - Cloudflare Realtime session identifier persisted/reused by join-time provisioning (`POST /api/interviews/:id/provision`).
- **`excalidraw_room_id`**: `text` (Optional) - Excalidraw live collaboration room ID persisted/reused by join-time provisioning.
- **`excalidraw_key`**: `text` (Optional) - Excalidraw room key persisted/reused with the room ID for whiteboard live collaboration.
- **`recording_url`**: `text` (Optional, **deprecated**) - Legacy URL for the session recording in R2. Kept during compatibility window; new writes must use normalized `interview_artifacts` rows with private object keys.
- **`screenshot_urls`**: `jsonb` (Optional, **deprecated**) - Legacy array of URLs for whiteboard captures stored in R2. Kept during compatibility window; new writes must use normalized `interview_artifacts` rows with private object keys.
- **`feedback`**: `jsonb` (Optional, **deprecated for client contracts**) - Stores the raw feedback JSON. DB persistence tolerates legacy freeform JSON; client-facing contracts validate/map to the strict versioned feedback v1 schema (see `docs/system/system-design/ai-feedback-pipeline.md` §5) only at ready-persistence and client-detail boundaries.
- **`recording_status`**: `text` with CHECK (`not_started`, `pending`, `recording`, `processing`, `ready`, `failed`) (Default: `not_started`) - Aggregate recording status derived from `interview_recordings` rows.
- **`screenshots_finalized_at`**: `timestamptz` (Optional) - When screenshot upload was finalized. `NULL` means upload is still open; a timestamp means finalized (zero screenshot rows at that point is a valid finalized-empty set).
- **`transcript`**: `text` (Optional) - Denormalized transcript text aggregate for client detail reads. Source-of-truth transcript chunks live in `interview_transcription_chunks`; this column is a read-optimized cache.
- **`feedback_status`**: `text` with CHECK (`not_started`, `pending`, `processing`, `ready`, `failed`) (Default: `not_started`) - Current feedback processing state.
- **`feedback_unavailable_reason`**: `text` with CHECK (`no_consent`, `unsupported_format`, `no_recording`) (Optional) - Set when `feedback_status = 'not_started'` to explain why feedback is unavailable.
- **`feedback_error_code`**: `text` with CHECK (`assets_not_ready`, `transcription_failed`, `analysis_failed`, `invalid_feedback`, `internal_error`) (Optional) - Set when `feedback_status = 'failed'` to explain the failure. Safe client-facing code; provider messages are never persisted.
- **`feedback_prompt_version`**: `text` (Optional) - Version of the prompt used to generate the feedback.
- **`feedback_generated_at`**: `timestamptz` (Optional) - When the feedback report was generated.
- **`feedback_attempt_id`**: `text` (Optional) - Unique identifier for the current feedback processing attempt.
- **`feedback_processing_started_at`**: `timestamptz` (Optional) - When the current processing attempt started.
- **`feedback_processing_heartbeat_at`**: `timestamptz` (Optional) - Last heartbeat timestamp during active processing.
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
- `idx_interviews_feedback_status` on (`feedback_status`) for feedback status queries.
- `idx_interviews_feedback_stale_processing` on (`feedback_processing_heartbeat_at`) WHERE `feedback_status = 'processing'` for stale-processing recovery.

Cross-field feedback status constraints:

- `ready` requires `feedback` NOT NULL, `feedback_prompt_version` NOT NULL, `feedback_generated_at` NOT NULL, and no `feedback_error_code` or `feedback_unavailable_reason`.
- `failed` requires `feedback_error_code` NOT NULL and no `feedback_unavailable_reason`.
- `processing` requires `feedback_attempt_id`, `feedback_processing_started_at`, `feedback_processing_heartbeat_at` NOT NULL and no terminal fields.
- `not_started` may contain only an allowed `feedback_unavailable_reason`; all processing/terminal fields must be NULL.
- `pending` clears all unavailable reason, error, attempt, and terminal fields.

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

### Premium_Interviewer_Slots

Verified-interviewer premium booking inventory: exact 60-minute slots published by verified interviewers as free inventory for the first-to-claim marketplace. **No database defaults** on any column; writers generate the `id` UUID with `crypto.randomUUID()` and supply `status`, `created_at`, and `updated_at` from trusted application code.

- **`id`**: `uuid` (Primary Key) - Application-generated UUID.
- **`interviewer_id`**: `uuid` (Foreign Key -> `"user".id`) - The verified interviewer publishing the slot. Plain `REFERENCES "user"(id)` with no `ON DELETE CASCADE`, so interviewer account-retention/soft-deletion workflows do not silently drop published slots.
- **`interview_type`**: `text` with CHECK (`system_design`, `coding`, `behavioral`) - Existing type enum preserved; no new enum type is introduced.
- **`start_time`**: `timestamptz` - Start of the 60-minute window.
- **`end_time`**: `timestamptz` - End of the 60-minute window.
- **`status`**: `text` with CHECK (`available`, `claimed`, `cancelled`) - No DB default.
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

Constraints:

- `premium_interviewer_slots_time_window_check`: `start_time < end_time`
- `premium_interviewer_slots_exact_60_minute_check`: `end_time = start_time + interval '60 minutes'` - mirrors the `availability_slots` exact-60-minute invariant.
- No exclusion constraint is used; overlap detection for a single interviewer is enforced with a bounded range scan in the repository (raw SQL), because the exact 60-minute invariant plus the active-status predicate does not need a GiST exclusion index.

Indexes:

- `idx_premium_interviewer_slots_interviewer_active` on (`interviewer_id`, `start_time`, `end_time`) WHERE `status <> 'cancelled'` - active-slot overlap detection for one interviewer at publish/claim time.
- `idx_premium_interviewer_slots_available_start` on (`status`, `start_time`, `id`) - public marketplace listing of `available` slots ordered deterministically by `start_time ASC, id ASC`.
- `idx_premium_interviewer_slots_interviewer_start` on (`interviewer_id`, `start_time`, `id`) - owner-list API ordering by `start_time ASC, id ASC`.
- `idx_premium_interviewer_slots_interviewer_status_start` on (`interviewer_id`, `status`, `start_time`, `id`) - owner-list status filtering.

### Premium_Slot_Claims

Durable claim-idempotency store for the premium first-to-claim marketplace. **No database defaults** on any column; `idempotency_key` and `created_at` are supplied by application code. The `idempotency_key` is the primary key; there is no surrogate `id` column (corrected by `20260808120000_correct_premium_slot_claims_primary_key.sql`).

- **`idempotency_key`**: `uuid` (Primary Key) - Claim idempotency key; the durable dedupe key for the claim transaction.
- **`slot_id`**: `uuid` (Unique, Foreign Key -> `premium_interviewer_slots.id`) - One claim per slot; the unique constraint makes the one-claim-per-slot relationship a database invariant.
- **`scheduler_id`**: `uuid` (Foreign Key -> `"user".id`) - The scheduler who claimed the slot.
- **`interview_id`**: `uuid` (Unique, Foreign Key -> `interviews.id`) - One claim per interview; the unique constraint makes the one-claim/one-interview relationship a database invariant.
- **`created_at`**: `timestamptz`

Behavior:

- The unique `slot_id` constraint/index serves Story 7.15 replay reconciliation; no redundant non-unique slot index is added.
- Duplicate `idempotency_key`, `slot_id`, or `interview_id` values are rejected by the primary key and unique constraints.

### Premium_Booking_Credit_Refunds

Internal audit/idempotency ledger for premium booking-credit refunds, **distinct from `Credit_Transactions`** (the Stripe fulfillment ledger). `Credit_Transactions` records Stripe payment fulfillment; this ledger records exactly one credit refunded per premium booking. **No database defaults** on any column.

- **`id`**: `uuid` (Primary Key) - Application-generated UUID with `crypto.randomUUID()` (never DB-defaulted).
- **`interview_id`**: `uuid` (Unique, Foreign Key -> `interviews.id`) - One refund row per premium booking ever; the unique constraint prevents a second refund row for the same interview.
- **`scheduler_id`**: `uuid` (Foreign Key -> `"user".id`) - The scheduler who paid the credit being refunded.
- **`reason`**: `text` with CHECK exactly (`interviewer_cancelled`, `interviewer_account_deleted`) - Only these two values exist; there is no `admin_cancelled` or `system_cancelled` reason anywhere in the milestone.
- **`initiated_by_user_id`**: `uuid` (NOT NULL, Foreign Key -> `"user".id`) - The acting user is always recorded; the deletion workflow that produces `interviewer_account_deleted` supplies the cancelled interviewer's id, never null.
- **`credits_refunded`**: `integer` with CHECK (`credits_refunded = 1`) - Exactly one scheduler credit per refund.
- **`created_at`**: `timestamptz`

Behavior:

- Scheduler-initiated cancellation or scheduler account deletion consumes the paid credit and writes **no** `premium_booking_credit_refunds` row; only interviewer cancellation or interviewer account deletion produces a refund row.

Indexes:

- `idx_premium_booking_credit_refunds_scheduler` on (`scheduler_id`, `created_at`) - scheduler refund-history listing.

### Interview_Artifacts

Normalized private artifact storage for recordings, transcription audio, and screenshots.

- **`id`**: `uuid` (Primary Key) - Application-generated UUID.
- **`interview_id`**: `uuid` (Foreign Key -> `interviews.id`, On Delete Cascade)
- **`artifact_kind`**: `text` with CHECK (`playback_recording`, `transcription_audio`, `screenshot`)
- **`participant_id`**: `uuid` (Optional, Foreign Key -> `"user".id`) - Participant ID for transcription audio tracks.
- **`participant_role`**: `text` (Optional) - Role label (`scheduler` or `interviewer`) for transcription audio tracks.
- **`object_key`**: `text` (Optional) - Private R2 object key. Cleared on expiry/deletion but row retained as tombstone.
- **`provider_asset_id`**: `text` (Optional) - Provider-side asset identifier.
- **`idempotency_key`**: `text` (Optional) - Deduplication key for artifact writes.
- **`content_metadata`**: `jsonb` (Optional) - Trusted content metadata (content type, size, checksum).
- **`captured_at`**: `timestamptz` (Optional) - When the artifact was captured.
- **`finalized_at`**: `timestamptz` (Optional) - When the artifact was finalized.
- **`expires_at`**: `timestamptz` (Optional) - Retention expiry timestamp.
- **`deleted_at`**: `timestamptz` (Optional) - Soft-delete timestamp; object key cleared but row retained.
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

Constraints:

- Unique (`interview_id`, `idempotency_key`) where `idempotency_key` IS NOT NULL.
- Unique provider asset identity where `provider_asset_id` IS NOT NULL.

Indexes:

- `idx_interview_artifacts_interview_kind` on (`interview_id`, `artifact_kind`)
- `idx_interview_artifacts_expiry` on (`expires_at`) WHERE `deleted_at` IS NULL
- `idx_interview_artifacts_object_key` on (`object_key`)

Retention notes:

- `screenshots_finalized_at IS NULL` on the interview row means screenshot upload is open; a timestamp means finalized. Zero screenshot artifact rows at finalization time is a valid finalized-empty set.
- Expiry/deletion tombstones are retained after clearing object keys so the API can distinguish expired artifacts from artifacts that never existed.
- MVP retention: 30 days for raw recordings and screenshots. Transcript and feedback are retained with the interview until interview/account deletion.

### Interview_Recordings

Normalized provider recording jobs for RealtimeKit composite and participant tracks.

- **`id`**: `uuid` (Primary Key) - Application-generated UUID.
- **`interview_id`**: `uuid` (Foreign Key -> `interviews.id`, On Delete Cascade)
- **`provider_recording_id`**: `text` (Unique) - RealtimeKit provider recording identifier.
- **`recording_type`**: `text` with CHECK (`composite`, `participant_track`)
- **`participant_id`**: `uuid` (Optional, Foreign Key -> `"user".id`) - Participant for track recordings.
- **`participant_role`**: `text` (Optional) - Role label (`scheduler` or `interviewer`) for track recordings.
- **`provider_status`**: `text` (Optional) - Provider-side status.
- **`stop_requested_at`**: `timestamptz` (Optional)
- **`stop_confirmed_at`**: `timestamptz` (Optional)
- **`finalization_status`**: `text` with CHECK (`pending`, `processing`, `finalized`, `failed`)
- **`finalization_checkpoint`**: `text` (Optional) - Resumable finalization checkpoint.
- **`error_code`**: `text` (Optional) - Safe error code (not provider error body).
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

Indexes:

- `idx_interview_recordings_interview_type` on (`interview_id`, `recording_type`)
- `idx_interview_recordings_provider` on (`provider_recording_id`)
- `idx_interview_recordings_stop_reconcile` on (`stop_requested_at`) WHERE `stop_confirmed_at` IS NULL
- `idx_interview_recordings_pending_finalization` on (`finalization_status`) WHERE `finalization_status IN ('pending', 'processing')`

### Interview_Recording_Consents

Participant recording consent decisions.

- **`interview_id`**: `uuid` (Foreign Key -> `interviews.id`, On Delete Cascade)
- **`user_id`**: `uuid` (Foreign Key -> `"user".id`, On Delete Cascade)
- **`decision`**: `text` with CHECK (`consented`, `declined`)
- **`consent_copy_version`**: `text` - Version of the consent copy shown to the participant.
- **`decided_at`**: `timestamptz`
- **`revoked_at`**: `timestamptz` (Optional) - If consent was later revoked.
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

Constraints:

- Composite primary key on (`interview_id`, `user_id`)

### RealtimeKit_Webhook_Events

Idempotent provider webhook event tracking.

- **`provider_event_id`**: `text` (Primary Key) - Provider event UUID.
- **`event_type`**: `text`
- **`recording_id`**: `text` (Optional) - Provider recording ID.
- **`provider_asset_id`**: `text` (Optional)
- **`status`**: `text` with CHECK (`accepted`, `finalizing`, `processed`, `failed`)
- **`attempt_count`**: `integer` (Default: 0)
- **`next_attempt_at`**: `timestamptz` (Optional)
- **`received_at`**: `timestamptz`
- **`processed_at`**: `timestamptz` (Optional)
- **`last_error_code`**: `text` (Optional) - Safe error code.

Indexes:

- `idx_realtimekit_webhook_events_recording` on (`recording_id`)
- `idx_realtimekit_webhook_events_pending` on (`next_attempt_at`) WHERE `processed_at` IS NULL

### Feedback_Replay_Audit

Operational replay audit trail for feedback regeneration.

- **`id`**: `uuid` (Primary Key) - Application-generated UUID.
- **`interview_id`**: `uuid` (Foreign Key -> `interviews.id`)
- **`prior_attempt_id`**: `text` (Optional) - Previous feedback attempt ID.
- **`prior_error_code`**: `text` (Optional) - Previous error code.
- **`target_schema_version`**: `integer` - Target feedback schema version.
- **`operator_identity`**: `text` - Operator who triggered the replay.
- **`reason`**: `text` - Reason for replay.
- **`created_at`**: `timestamptz`

Indexes:

- `idx_feedback_replay_audit_interview` on (`interview_id`)

### Interview_Transcription_Chunks

Dedicated transcript persistence for retry-safe transcription.

- **`id`**: `uuid` (Primary Key) - Application-generated UUID.
- **`interview_id`**: `uuid` (Foreign Key -> `interviews.id`, On Delete Cascade)
- **`feedback_attempt_id`**: `text` - Feedback attempt identifier.
- **`participant_role`**: `text` (Optional) - `scheduler` or `interviewer`.
- **`chunk_index`**: `integer` - Deterministic chunk ordering.
- **`status`**: `text` with CHECK (`pending`, `transcribed`, `failed`)
- **`transcript_text`**: `text` (Optional) - Bounded transcript text for this chunk.
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

Constraints:

- Unique (`interview_id`, `feedback_attempt_id`, `COALESCE(participant_role, '')`, `chunk_index`) — COALESCE ensures NULL participant_role is treated as a deterministic sentinel so duplicate chunks cannot coexist when participant_role is NULL.

Indexes:

- `idx_interview_transcription_chunks_interview_attempt` on (`interview_id`, `feedback_attempt_id`)
- `idx_interview_transcription_chunks_pending` on (`status`) WHERE `status = 'pending'`
