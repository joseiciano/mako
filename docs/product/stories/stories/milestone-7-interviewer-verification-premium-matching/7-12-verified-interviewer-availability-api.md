# Story 7.12: Verified Interviewer Availability API

**Milestone**: Milestone 7: Interviewer Verification & Premium Matching
**Description**: Implement the authenticated API that lets a verified interviewer publish, list, and cancel their premium availability slots as first-to-claim marketplace inventory, enforcing eligibility (`"user".companies = true`), exact 60-minute future windows, configurable lead/horizon bounds, non-overlap/conflict rules, and concurrent-publication serialization via a deterministic user-row lock.
**Status**: Completed

## What Needs to Be Done

### 1. Publish a premium slot
- [ ] Implement `POST /api/premium/interviewer/slots` (the route locked by Story 7.11) guarded by the existing auth middleware, so only an active authenticated user may publish.
- [ ] Enforce eligibility before publishing: the authenticated user must be active (not soft-deleted) and have `"user".companies = true` (the verified-interviewer eligibility flag set by Story 7.8). An authenticated inactive/deleted account returns `403 { error: 'ACCOUNT_INACTIVE' }`; a non-eligible account returns `403` — with no mutation.
- [ ] Accept a body of `{ interviewType, startTime }` per the Story 7.11 publish schema. Derive `endTime = startTime + 60 minutes` server-side; clients do not submit `endTime`, `status`, or `interviewerId`.
- [ ] Require `interviewType` to be exactly one of `system_design | coding | behavioral` (preserve the existing type enum). Reject any other value with `400`.
- [ ] Enforce configurable time bounds from the Story 7.11 policy metadata: `startTime` must be at least the configured lead time in the future (default `leadTimeMinutes: 60`) and within the configured horizon (default `horizonDays: 90` from now). Invalid windows return `400`. Read the lead/horizon from config, not hardcoded literals.
- [ ] Serialize concurrent publication before any overlap/interview check or insertion by locking the active interviewer user row:
  - [ ] Inside the publish transaction, first `SELECT id, deleted_at, companies FROM "user" WHERE id = $interviewerId FOR UPDATE` (the deterministic user-row lock) to serialize publishes by the same interviewer.
  - [ ] **Re-read and revalidate the interviewer user row under the lock**: after acquiring the `FOR UPDATE` lock, re-read the locked row's current active/deleted state and `companies` flag (do not trust pre-transaction eligibility). If the row is soft-deleted (`deleted_at` set) or inactive, reject with `403 { error: 'ACCOUNT_INACTIVE' }`; if `companies <> true`, reject with `403` (non-eligible). This revalidation must happen under the lock before any overlap/interview check or insertion, so a publish cannot race an account deletion or an eligibility revocation into inventory.
  - [ ] Then re-read the interviewer's existing active slots via the Story 7.11 overlap index `idx_premium_interviewer_slots_interviewer_active (interviewer_id, start_time, end_time) WHERE status <> 'cancelled'` and reject the new slot with `409` if it overlaps any non-cancelled existing premium slot for that interviewer (overlap = any time intersection with the 60-minute window).
  - [ ] This user-row lock interoperates with the existing tier-policy and matcher user locks (which lock the same `"user"` row to serialize credit/quota-sensitive writes): because every conflict-sensitive writer takes the identical deterministic user-row lock, cross-channel writes cannot interleave conflict checks and inserts. Document this in `docs/system/system-design/concurrency-data-integrity.md`.
- [ ] Reject the publish with `409` if the new window conflicts with any interview where this user participates in **either** participant role — `interviews.interviewer_id = $interviewerId` **or** `interviews.scheduler_id = $interviewerId` — in `status = 'scheduled'` or `'ongoing'` overlapping the window.
- [ ] Insert the row with `status = 'available'` and generate the UUID with `crypto.randomUUID()`; supply `created_at`/`updated_at` from application code. Return `201` with the exact `{ slot: PremiumInterviewerSlot }` envelope.
- [ ] Return errors with the existing `{ error: string }` shape. Set `Cache-Control: private, no-store` on this route.

### 2. List the interviewer's own slots
- [ ] Implement `GET /api/premium/interviewer/slots` guarded by auth, scoped strictly to the authenticated user's `interviewer_id` rows.
- [ ] Support optional `status` filter (`available | claimed | cancelled`, default all), optional `interviewType` filter, and `limit`/`offset` pagination with Story 7.11 defaults (`limit` default 25, max 100, `offset` default 0). The public contract ordering is deterministic `ORDER BY start_time ASC, id ASC`, served by the unfiltered `(interviewer_id, start_time, id)` index; when a `status` filter is present the query may instead use the status-aware Story 7.11 manage index `idx_premium_interviewer_slots_interviewer_status_start (interviewer_id, status, start_time, id)` for scan efficiency, but must never change the public contract ordering to status-first — response ordering stays `start_time ASC, id ASC`.
- [ ] Require exact query validation: `limit` must be an integer in `1..100` (default 25) and `offset` must be a non-negative integer (default 0); reject with `400` any malformed, fractional, non-numeric, or out-of-range `limit`/`offset`, and any `status`/`interviewType` value outside the accepted enums.
- [ ] Return `{ slots: PremiumInterviewerSlot[], pagination: { limit, offset, hasMore }, policy: PremiumPolicyMetadata }`, where policy reports the active configured lead/horizon values (defaults 60 minutes/90 days) and `priceCredits: 1`.
- [ ] Return errors with the existing `{ error: string }` shape. Set `Cache-Control: private, no-store`. Unauthenticated requests return `401`; authenticated inactive/deleted accounts return `403 { error: 'ACCOUNT_INACTIVE' }`.

### 3. Cancel a published slot
- [ ] Implement `DELETE /api/premium/interviewer/slots/:id` guarded by auth, allowing the owner to cancel an `available` slot.
- [ ] Enforce ownership: the slot must belong to the authenticated user; unknown id or non-owner returns `404` (do not leak existence).
- [ ] Use an atomic guarded update `AND status = 'available'` to transition to `cancelled`; a zero-row result means the slot is unknown or already `claimed`/`cancelled`. Initial cancellation and an already-cancelled idempotent retry both return exactly `200 { success: true }`; a `claimed` slot returns `409` (a claimed slot must never be reopened or cancelled by the interviewer after a scheduler claim).
- [ ] Do not refund any credit and do not reopen the slot on interviewer cancellation of an `available` slot (no scheduler has paid yet).
- [ ] Return errors with the existing `{ error: string }` shape. Set `Cache-Control: private, no-store`. Unauthenticated requests return `401`; authenticated inactive/deleted accounts return `403 { error: 'ACCOUNT_INACTIVE' }`.

### 4. Repository & service structure
- [ ] Implement a `premium` module under `packages/shared-backend/src/premium/` following the controller-service-repository pattern (`docs/coding/backend-instructions.md`). The repository owns raw SQL transactions/locking; the service owns eligibility, lead/horizon, non-overlap, and interview-conflict rules; the controller owns HTTP parsing and response mapping.
- [ ] Export the module through `packages/shared-backend/src/index.ts` and register the routes in `apps/backend-rest/src/index.ts` using the existing auth middleware and Hyperdrive-backed connection wiring.
- [ ] Reuse the shared `PremiumInterviewerSlot`, publish-input, and `PremiumPolicyMetadata` contracts from Story 7.11; do not define a competing contract.

### 5. Tests
- [ ] Unit/service tests: eligibility rejection for inactive and non-`companies=true` users (`403`), lead-time and horizon bound enforcement, overlap rejection against existing non-cancelled premium slots, and rejection when the window conflicts with a scheduled/ongoing interview where the user is **either** `interviewer_id` **or** `scheduler_id`.
- [ ] Concurrency tests with an initially empty slot range: two overlapping publishes by the same interviewer serialize so exactly one succeeds and the second returns `409`; two non-overlapping publishes both succeed. No overlapping non-cancelled inventory is ever produced.
- [ ] Publish-vs-account-deletion race test: a publish that acquires the interviewer user-row lock after an account deletion (or concurrent with it) re-reads the locked row, observes the soft-deleted/inactive state or non-`companies` flag, and rejects with `403` with no slot inserted; an already-locked publish serialized behind a deletion never inserts inventory for a deleted/ineligible interviewer.
- [ ] Route tests: publish success `201`, invalid body/type/time `400`, conflict `409`, unauthorized `401`, owner-list filtering and pagination, cancel success, unknown/non-owner `404`, claimed-slot cancel `409`, already-cancelled idempotent `200`.
- [ ] Verify `Cache-Control: private, no-store` and the `policy` metadata in the owner list response. Verify publish/cancel mutations write only `available` or `cancelled`; the owner-list read path must still parse and return all three persisted statuses, including `claimed` rows written by Story 7.15.

### 6. Observability
- [ ] Emit structured, PII-safe events for `premium.slot.publish_requested`, `premium.slot.publish_succeeded`, `premium.slot.publish_conflicted`, and `premium.slot.cancelled`, including only slot/interviewer IDs, time bounds, interview type, and outcome. Do not log display names, images, application data, or employment data.
- [ ] Emit retry/conflict diagnostics for transaction failures with the stable slot/interviewer context needed to debug contention, without logging auth cookies or database credentials.

## Implementation Notes
- **Prerequisites**: Story 7.11 (persistence + shared contracts + locked routes), Story 7.8 (`"user".companies = true` eligibility), Milestone 6 credit module (not consumed here, but the booking/claim side depends on it).
- Only an active user with `"user".companies = true` may publish. This is the single eligibility gate; no per-slot verification badge is published (marketplace badges come from Story 7.15 display rules).
- The deterministic user-row lock (`SELECT ... FOR UPDATE` on the interviewer's `"user"` row) is the same lock tier-policy and matcher writers use; it serializes all conflict-sensitive inserts for a user across channels. Story 7.15 reuses this same deterministic user-row locking for the scheduler and interviewer in the claim transaction.
- Interviewers receive no charge, compensation, or payout for published slots. No payout fields are introduced.
- This ticket does not implement the public marketplace discovery listing or the scheduler claim transaction (Story 7.15), nor any frontend UI (Stories 7.13 and 7.16).
- The exact 60-minute window is derived server-side; the DB CHECK from Story 7.11 is the final backstop.
- No `availability_requests`/`availability_slots` reuse: premium slots live only in `premium_interviewer_slots`.

## End Goal
A verified interviewer can publish exact 60-minute premium slots bounded by configurable lead/horizon, list their own inventory with pagination and policy metadata, and cancel only still-available slots. Eligibility, window, non-overlap, and interview-conflict rules are enforced atomically under a deterministic user-row lock so concurrent publishes never produce overlapping inventory and the marketplace only ever exposes valid first-to-claim slots.
