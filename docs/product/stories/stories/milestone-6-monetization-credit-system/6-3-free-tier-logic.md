# Story 6.3: Free Tier Logic

**Milestone**: Milestone 6: Monetization & Credit System
**Description**: Enforce initial free standard and AI interview quotas on new accounts, and implement the server-side tier-resolution policy that determines whether an interview consumes a free quota or a paid credit.
**Status**: Done
**Prerequisites**:
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-2-credit-repository-service.md` (must be completed first; this story depends on `creditRepository.decrementCredits()`)
- `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-5-interview-create-route-post-api-interviews.md`

## What Needs to Be Done

### 1. Verify free quota defaults on user creation
- [ ] Confirm the `"user"` table already defaults `free_standard_interviews` and `free_ai_interviews` to `1` as documented in:
  - `docs/system/system-design/db-schemas.md` (User section, lines 33-34)
- [ ] If the existing migration does not include the defaults, write a new migration to add `DEFAULT 1` constraints to both columns.
- [ ] Confirm the `CHECK` constraints `free_standard_interviews >= 0` and `free_ai_interviews >= 0` are in place.

### 2. Build the internal free-tier policy service
- [ ] Implement an internal tier policy service in `packages/shared-backend/src/tier-policy/` following the existing backend module pattern (service, repository, types, index barrel). Do not add a public tier-policy controller or route unless a separate story documents an API contract.
- [ ] The service must resolve interview tier and quota consumption as documented in:
  - `docs/system/system-design/api-routes.md` (POST /api/interviews, lines 92-94)
- [ ] Refactor any existing AI-led free-quota / credit fallback logic from the interview module into this shared service instead of duplicating policy resolution.
- [ ] Policy resolution rules for AI-led interview creation:
  - If `free_ai_interviews > 0`: accept the request, consume one free AI quota, resolved tier = `standard`.
  - If `free_ai_interviews = 0` AND `credits > 0`: accept the request, consume one credit via `creditRepository.decrementCredits()` within the interview-creation transaction, resolved tier = `premium`.
  - If `free_ai_interviews = 0` AND `credits = 0`: reject the request with a business-rule error (e.g., `"INSUFFICIENT_CREDITS"`).
- [ ] For Standard peer-to-peer interviews (created by the matcher), both matched users must pay for the match before the interview row is inserted:
  - For each user, if `free_standard_interviews > 0`: consume one free Standard quota for that user.
  - For each user, if `free_standard_interviews = 0` AND `credits > 0`: consume one credit for that user via `creditRepository.decrementCredits()` within the matcher's transaction.
  - If either user has `free_standard_interviews = 0` AND `credits = 0`: skip the pair and do not consume quota or credits for either user.
- [ ] All quota mutations must be atomic: decrementing `free_*_interviews` or `credits` must happen inside the same database transaction as the interview creation. Credit decrements must call `creditRepository.decrementCredits()` (from Story 6.2) with the shared query executor — do not call `creditService.deductCredits()` which manages its own transaction.
- [ ] Matcher-created interview `tier` is `standard` only when both users consume free Standard quota; it is `premium` when either user consumes a paid credit.

### 3. Integrate policy resolution into POST /api/interviews
- [ ] Wire the tier policy service into the existing `POST /api/interviews` route handler.
- [ ] The client must not submit a `tier` field — the server resolves tier from account state per the contract in:
  - `docs/system/system-design/api-routes.md` (POST /api/interviews, line 88-98)
- [ ] Reject requests containing a client-selected `tier` field with a validation error.
- [ ] After successful quota consumption and tier resolution, include the resolved `tier` in the created interview row.
- [ ] Ensure the full create operation (quota decrement + interview insert) is a single database transaction so partial consumption cannot occur.

### 4. Integrate policy resolution into the Greedy Matcher
- [ ] Wire the tier policy service into the Greedy Matcher worker so peer-to-peer matches reserve resources for both users before creating an interview.
- [ ] The matcher must check `free_standard_interviews` and `credits` for both candidate users before pairing them.
- [ ] Candidate users with zero free Standard quota and zero credits are excluded from successful pair creation for that cycle.
- [ ] Matcher-created interviews must set `tier` to `standard` when both users consume free quota, and `premium` when either user consumes a credit.
- [ ] The matcher's transactional match-and-interview-write logic must include both users' resource consumption atomically; no partial consumption may persist if either user cannot pay or the interview insert fails.

### 5. Add free-tier logic tests
- [ ] Unit tests for tier policy service:
  - AI-led with free quota available → consumes free_ai_interviews, tier = `standard`.
  - AI-led with free quota exhausted and credits available → consumes one credit, tier = `premium`.
  - AI-led with both exhausted → returns `INSUFFICIENT_CREDITS` error.
  - Standard peer-to-peer where both users have free quota available → consumes `free_standard_interviews` for both users, tier = `standard`.
  - Standard peer-to-peer where one or both users have free quota exhausted but credits available → consumes required credit(s), tier = `premium`.
  - Standard peer-to-peer where either user has both exhausted → pair is skipped and no resources are consumed.
- [ ] Integration tests for `POST /api/interviews`:
  - Creating AI-led interview with free quota consumes quota and returns correct tier.
  - Creating AI-led interview with credits consumes credit and updates balance.
  - Creating AI-led interview with no resources returns error.
  - Request containing `tier` field is rejected.
  - Transaction rollback: if interview insert fails after quota decrement, quota is restored.
- [ ] Integration tests for matcher:
  - Two users with free Standard quota get matched, both quotas decrement, and tier is `standard`.
  - A match where either user pays with credits decrements the appropriate credit balance(s) and sets tier to `premium`.
  - A pair where either user has no free Standard quota and no credits is skipped with no quota or credit decrements for either user.

## Implementation Notes
- The free-tier policy is server-side only. The frontend never decides whether to consume a free quota or a credit — the backend resolves this based on account state at request time.
- Free quota is consumed before paid credits. Users cannot choose to save their free quota and pay instead.
- Free quotas are one-time grants. There is no periodic reset, refill, or recurring free quota in this milestone. If the product later requires a refill mechanism, that is a separate story.
- The tier policy service must be reusable across both the direct interview creation route and the Greedy Matcher worker. Do not duplicate the resolution logic.
- Do not add subscription-based tier logic, premium interviewer assignment, or tier-specific feature gating in this story.
- Quota check and consumption must be part of the same database transaction as the interview write. Use `SELECT ... FOR UPDATE` on the user row to prevent race conditions between concurrent interview creation attempts.
- For matcher-created peer-to-peer interviews, lock both user rows in deterministic `user_id` order inside the match transaction before resolving each user's payment source. This avoids deadlocks and prevents partial resource consumption.
- The `GET /api/account` route already returns `free_standard_interviews` and `free_ai_interviews` — this story ensures those values are correctly decremented by the policy service.

## End Goal
New users start with 1 free Standard interview and 1 free AI interview. When a user creates an AI-led interview, the server-side policy consumes free AI quota first, then falls back to paid credits. When the matcher creates a peer-to-peer interview, both users must pay: each consumes free Standard quota first, then falls back to paid credits. Clients cannot override tier selection. All quota mutations are atomic with the interview write, preventing double-consumption or orphaned quota deductions. Users with no free quota and no credits receive clear rejection errors or are excluded from matching.
