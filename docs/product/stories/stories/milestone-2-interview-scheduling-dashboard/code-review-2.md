# Code Review: Story 5.2 — Scheduling Step Map and Navigation Rules

**Final Decision:** LGTM

**Target Branch:** `origin/main`
**Risk Tier:** full

**Scope Reviewed:**
- Shared availability request/response contracts for `POST /api/availability`
- Scheduling flow reducer, branched navigation rules, and confirmation gating
- Scheduling smart/dumb UI split for AI-led and P2P paths
- Route, hook, and contract test coverage for progression, resets, and payload building

**Validation Performed:**
- `pnpm --filter @mako/shared test`
- `pnpm --filter @mako/frontend test`
- `pnpm --filter @mako/frontend typecheck`
- `pnpm typecheck`
- `pnpm test`

**Notes:**
- First review pass surfaced minor nits around duplicate labels, submit-state edit links, test URL hygiene, and brittle selectors; all were fixed.
- Re-review returned LGTM for current Story 5.2 scope.
- Pre-existing demo auth header pattern remains broader app debt, not a Story 5.2 blocker.
