## AI Code Review

**Decision**: significant_concerns
**Reason**: The new participant detail route now returns persisted collaboration credentials through a routine `GET` endpoint, which breaks the documented join-time provisioning boundary and is unsafe to merge as-is. There is also one remaining correctness issue in the demo-mode interview ordering path.

---

### Code Quality
**Status**: issues_found
**Recommendation**: 📝 Minor Comments
**Summary**: One correctness issue remains in the demo interview listing path.

`apps/backend-rest/src/index.ts:387` — `compareInterviewListOrder` still compares `scheduled_at` as raw strings even though this PR now accepts offset-bearing ISO-8601 timestamps. Values like `2026-05-01T14:00:00.000Z` and `2026-05-01T10:00:00-05:00` will sort lexicographically instead of by actual instant, so the demo/no-DB `/api/interviews` path can return a different order than the SQL-backed repository. How to fix it: compare `new Date(left.scheduled_at).getTime()` and `new Date(right.scheduled_at).getTime()` instead, and add a regression test in `apps/backend-rest/src/index.test.ts` that covers mixed-offset timestamps. [WARNING]

---

### Security
**Status**: issues_found
**Recommendation**: 🔴 Serious Concerns
**Summary**: The new interview detail route exposes persisted collaboration credentials outside the dedicated provisioning flow.

`packages/shared/src/interviews.ts:42`, `packages/shared-backend/src/interviews/interview-repository.ts:291`, `packages/shared-backend/src/interviews/interview-controller.ts:73` — `GET /api/interviews/:id` now returns `realtime_session_id`, `excalidraw_room_id`, and `excalidraw_key` for any authorized participant. That bypasses the documented join-time `POST /api/interviews/:id/provision` boundary and turns a normal detail fetch into a credential-retrieval path, which broadens exposure through browser caches, generic client logging, and any consumer that only needed interview metadata. How to fix it: keep collaboration credentials off the detail DTO and off `getParticipantInterviewById`, and continue returning them only from the provision endpoint where you can enforce join-time checks and issue the minimum required access material. [BLOCKING]

---

### Performance
**Status**: issues_found
**Recommendation**: 💬 Optional Nits
**Summary**: The cancel flow now reads more interview data than it uses.

`packages/shared-backend/src/interviews/interview-service.ts:159`, `packages/shared-backend/src/interviews/interview-repository.ts:331`, `packages/shared-backend/src/interviews/interview-repository.ts:388` — the cancellation path now fetches and returns detail-only fields such as `realtime_session_id`, `excalidraw_*`, `recording_url`, `screenshot_urls`, and `feedback` even though the endpoint only responds with `{ success: true }` and the cancellation event only needs core interview metadata. How to fix it: introduce a lightweight cancellation projection for the pre-read and `UPDATE ... RETURNING` queries so the cancel path only loads the columns needed for authorization, status checks, and event construction. [SUGGESTION]

---

### Documentation
**Status**: lgtm
**Recommendation**: ✅ Approve
**Summary**: No issues found.

No issues found.

---

*Review generated from diff of `c249a9edf515fd3b6e0f33244e394bfabfb2bd88` .. `HEAD` against `origin/main`.*
*Changed files: 23 | Lines: +1668 -23*
