## AI Code Review

**Decision**: approved_with_comments
**Reason**: The implementation correctly separates list (summary-only) and detail response schemas, properly excludes collaboration credentials (`realtime_session_id`, `excalidraw_room_id`, `excalidraw_key`) from all API responses via both SQL column selection and Zod schema filtering, and enforces participant-only authorization on the new detail endpoint. One pre-existing demo-mode sorting bug was surfaced by the timestamptz offset changes but is not merge-blocking.

---

### Code Quality
**Status**: issues_found
**Recommendation**: 📝 Minor Comments
**Summary**: One demo-mode sorting bug became more likely to manifest due to widened timestamptz offset acceptance; one minor inconsistency between demo and repository in-memory list implementations.

- `apps/backend-rest/src/index.ts:396` — `compareInterviewListOrder` uses lexicographic string comparison (`left.scheduled_at < right.scheduled_at`) instead of temporal comparison. This PR widened `scheduled_at` validation to accept `{ offset: true }` (e.g., `2026-04-10T10:30:00.000+02:00`), so timestamps with different offsets will now sort incorrectly in demo mode. The production SQL path (`ORDER BY scheduled_at ASC`) and the shared in-memory data source (`new Date().getTime()`) both compare correctly. Fix by using `new Date(left.scheduled_at).getTime()` in the demo sort function to match the repository implementation. [WARNING]

- `apps/backend-rest/src/index.ts:348-350` — The demo `listParticipantInterviews` returns `structuredClone(interview)` (full `Interview` with all 6 session fields) while the repository in-memory data source at `interview-repository.ts:543` calls `parseInterviewListItem(structuredClone(interview))` to strip those fields. The service layer's `toInterviewListResponse` applies Zod parsing (`.strip()` by default), so extra keys are dropped at the response boundary with no runtime bug. Still, aligning the two implementations by calling `parseInterviewListItem` in the demo source would improve maintainability. [INFO]

---

### Security
**Status**: issues_found
**Recommendation**: 💬 Optional Nits
**Summary**: Authorization and data-exposure defenses are correctly implemented with defense-in-depth (SQL column selection + Zod schema filtering). Three non-blocking observations about type safety and data model transparency.

- `packages/shared/src/interviews.ts:47` — `feedback` is typed as `z.record(z.string(), z.unknown()).nullable()`. The `z.unknown()` value accepts non-JSON-serializable types (`undefined`, `NaN`, `Infinity`, functions) that silently become `null` at serialization boundaries. Consider narrowing to a JSON-compatible union or a concrete feedback schema once the shape is defined. [SUGGESTION]

- `packages/shared/src/interviews.ts:95-97` — `createInterviewResponseSchema` wraps the full `interviewSchema`, exposing all 6 session fields (as `null`) in the `POST /api/interviews` response body. This is not a data leak but unnecessarily reveals the full data model shape. Consider filtering the create response similarly to the detail response for consistency. [SUGGESTION]

- `packages/shared-backend/migrations/20260402123000_add_interviews_table.sql` — `excalidraw_key` is stored as plain `TEXT`. It is correctly excluded from all API responses (omitted from SQL SELECT in list/detail/create queries and filtered by Zod schemas), but any party with database access can read this value. If this is a whiteboard encryption key, consider application-layer encryption using a KMS-derived key. [INFO]

---

### Performance
**Status**: lgtm
**Recommendation**: ✅ Approve
**Summary**: Query patterns are efficient — list query correctly drops all 6 optional columns, detail query is a clean single-row PK lookup, and cancellation overhead from wider SELECT FOR UPDATE is negligible on a single-row PK index scan.

No separate issues found.

---

### Documentation
**Status**: issues_found
**Recommendation**: 💬 Optional Nits
**Summary**: The `api-routes.md` documentation in the PR is accurate and up-to-date, but three other repository files that reference the `GET /api/interviews/:id` endpoint are now stale since the endpoint was implemented in this PR.

- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-9-interview-details-route-get-api-interviews-id.md:5` — Status is "Todo" and all implementation checkboxes are unchecked, but the endpoint was implemented in this PR. This story file is in Milestone 3 scope (not Milestone 2), so the remaining Story 3.9 scope may differ. Verify and update accordingly. [INFO]

- `docs/system/system-design/frontend-pages.md:22` — States the detail route is "story-gated" and unimplemented. Now stale. Update to reflect the route is live. [INFO]

- `docs/system/system-design/frontend-pages.md:38` — Claims `GET /api/interviews/:id` is "explicitly out of Milestone 2 Story 3 CRUD scope." Now stale — the endpoint was added within Milestone 2. Update. [INFO]

---

*Review generated from diff of `c249a9edf515fd3b6e0f33244e394bfabfb2bd88` .. `HEAD` against `origin/main`.*
*Changed files: 19 | Lines: +1668 -23*
