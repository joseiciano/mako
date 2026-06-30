# Story 6.4: Account Credit Balance Contract

**Milestone**: Milestone 6: Monetization & Credit System
**Description**: Ensure the existing authenticated account endpoint returns the current paid credit balance for billing and scheduling UI consumers.
**Status**: Completed
**Prerequisites**:
- `docs/product/stories/stories/milestone-1-foundation-authentication/2-1-user-profile-quotas.md`
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/frontend-pages.md`

## What Needs to Be Done

### 1. Verify the existing account route contract
- [x] Confirm `GET /api/account` returns `credits` from the `"user"` table as documented in `docs/system/system-design/api-routes.md` (Account Management / GET /api/account).
- [x] Confirm the billing page design in `docs/system/system-design/frontend-pages.md` consumes `credits` from the account response.
- [x] Confirm the account response continues to include `freeStandardInterviews` and `freeAiInterviews` alongside `credits`.

### 2. Extend the existing route only if needed
- [x] If `GET /api/account` does not currently include `credits`, add it to the existing account response shape.
- [x] Do not duplicate the account route or create a credit-specific balance endpoint for this milestone.
- [x] Ensure the response reads the current database value at request time and does not use stale client- or server-side cached balance data.

### 3. Add account balance tests
- [x] Add integration coverage that `GET /api/account` includes `credits` for authenticated users.
- [x] Add coverage showing the returned `credits` value reflects the current database balance after a balance mutation fixture.
- [x] Preserve existing unauthenticated account-route behavior.

## Implementation Notes
- The `"user".credits` column already exists in the foundation schema (`docs/system/system-design/db-schemas.md`, User section).
- This story is intentionally narrow: it only verifies or extends the existing account route response.
- Do not implement credit mutations, transaction history, Stripe, package purchase, or billing UI in this story.
- Account API returns camelCase JSON mapped from `"user".credits`, `"user".free_standard_interviews`, and `"user".free_ai_interviews`.

## End Goal
Authenticated clients can rely on `GET /api/account` as the source of truth for current paid credit balance and free quota display.
