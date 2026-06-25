# Story 6.5: Billing Route Shell and Balance Summary

**Milestone**: Milestone 6: Monetization & Credit System
**Description**: Replace the `/billing` placeholder with an authenticated billing page shell that shows current credits and free quota context.
**Status**: Todo
**Prerequisites**:
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-4-account-credit-balance-contract.md`
- `docs/product/stories/stories/milestone-6-monetization-credit-system/6-3-free-tier-logic.md`
- `docs/system/system-design/frontend-pages.md`

## What Needs to Be Done

### 1. Replace the authenticated billing route stub
- [ ] Update `apps/frontend/src/routes/_authenticated.billing.tsx` so the protected `/billing` route delegates to a billing smart component.
- [ ] Add route-level billing files under `apps/frontend/src/routes/billing/`, following the existing smart/dumb split used by dashboard route files.
- [ ] Keep the page inside the existing authenticated app shell and preserve the existing Billing navigation entry from `apps/frontend/src/components/layout/navigation/nav-items.ts`.
- [ ] Remove copy that implies subscription or plan management; Milestone 6 billing is pay-per-credit only.

### 2. Render current credit and free quota balances
- [ ] Use the existing account contract from `GET /api/account` to render `credits`, `free_standard_interviews`, and `free_ai_interviews`.
- [ ] Reuse the existing account query hook where possible instead of creating duplicate account-fetching logic.
- [ ] Make it clear that free AI quota is consumed before paid credits and that credit-backed AI usage is resolved server-side according to account policy.
- [ ] Do not add client-side scheduling tier selection or any client-side policy override; scheduling policy remains backend-owned.

### 3. Implement route shell page states and accessibility
- [ ] Add loading state for account data.
- [ ] Add error state for account loading failures with retry affordance when existing account-query patterns support it.
- [ ] Add populated balance state that can later host package purchase and transaction-history panels.
- [ ] Use accessible headings, labels, keyboard-friendly controls, and screen-reader-safe status messaging.
- [ ] Keep responsive layout aligned with existing Tailwind authenticated-page styling.

### 4. Add route shell and balance tests
- [ ] Add smart component tests for account loading, account error, and populated balance states.
- [ ] Add tests that verify balances render from `GET /api/account` fields.
- [ ] Add tests that verify the page copy does not expose subscription, plan management, client-selected tier, or client-side policy override controls.

## Implementation Notes
- `/billing` is already mounted as an authenticated route; this story turns the placeholder route into the billing page foundation.
- Server state should use TanStack Query. UI-only display state may stay local to the billing smart component or focused child components.
- The source-of-truth balance is the `"user".credits` field returned by `GET /api/account`.
- Backend quota and credit consumption behavior remains owned by Credit Repository and Balance Service plus Free Tier Logic stories. This story only consumes and explains returned account fields.
- Do not add credit package purchase, Stripe Elements checkout, transaction history, subscriptions, saved payment methods, invoices, refunds, or admin billing controls in this story.

## End Goal
Users can visit `/billing` and understand their current paid credit balance plus remaining free Standard and AI interview quotas inside the authenticated app shell.
