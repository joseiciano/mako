# Code Review 3 — Story 5.4 Availability Create Route

**Decision: LGTM**

## Scope

- `POST /api/availability` route, controller, service, repository, shared contracts, docs, and backend wiring.
- Ticket: `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/5-4-availability-route-post-api-availability.md`

## Result

All review findings resolved:

- Auth rejection happens before body parsing for unauthenticated requests.
- Request schema validates enum, positive `max_matches`, exact 60-minute slots, `start_time < end_time`, strict objects, and max 200 slots.
- Duplicate slot detection uses normalized epoch keys without collision-prone hashing.
- SQL path writes only `availability_requests` and `availability_slots` in one transaction.
- Slot persistence uses one batched parameterized insert, avoiding per-slot DB round-trips.
- Response remains validated at route boundary.
- API route docs and story validation rules mention max 200 slots.
- DB-backed availability smoke test verifies Hyperdrive wiring and no interview inserts.

## Verification

- `pnpm --filter @mako/shared test` — pass, 71 tests
- `pnpm --filter @mako/shared-backend test` — pass, 302 tests
- `pnpm --filter @mako/backend-rest test` — pass, 22 tests
- `pnpm --filter @mako/shared typecheck` — pass
- `pnpm --filter @mako/shared-backend typecheck` — pass
- `pnpm --filter @mako/backend-rest typecheck` — pass
