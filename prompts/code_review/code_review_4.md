## AI Code Review

**Decision**: significant_concerns
**Reason**: The branch now includes collaboration secrets and private interview artifacts in the generic participant interview list payload, which makes them retrievable through routine list responses. It also leaves a demo-mode ordering bug for offset-bearing timestamps.

---

### Code Quality
**Status**: issues_found
**Recommendation**: 📝 Minor Comments
**Summary**: Demo-mode interview sorting still compares timestamp strings, so offset-bearing timestamptz values can be returned in the wrong order.

- `apps/backend-rest/src/index.ts:374` `compareInterviewListOrder` still sorts `scheduled_at` lexicographically. After this PR broadens interview timestamps to accept explicit offsets, values like `2026-04-10T10:00:00+02:00` and `2026-04-10T09:30:00Z` no longer sort by actual instant, so the in-memory/demo `/api/interviews` path can return a different order than the SQL repository. Fix by parsing both timestamps to epoch milliseconds before comparing, then add a regression test with mixed-offset values. [WARNING]

---

### Security
**Status**: issues_found
**Recommendation**: 🔴 Serious Concerns
**Summary**: The participant interview list contract now includes collaboration credentials and private artifact fields, and the repository query eagerly returns them for every list request.

- `packages/shared/src/interviews.ts:42` and `packages/shared-backend/src/interviews/interview-repository.ts:624` add `realtime_session_id`, `excalidraw_room_id`, `excalidraw_key`, `recording_url`, `screenshot_urls`, and `feedback` to the list-item schema/query used for participant interview listing. That turns a routine `GET /api/interviews` response into a carrier for encryption keys and private recording/screenshot metadata, which broadens exposure to browser caches, client logs, and any code that only needed summary list data. Fix by restoring a slim list-item contract that omits collaboration credentials and other private artifacts, and expose those fields only from a dedicated, explicitly gated detail/provision endpoint if they are truly required. [BLOCKING]

---

*Review generated from diff of `c249a9edf515fd3b6e0f33244e394bfabfb2bd88` .. `HEAD` against `origin/main`.*
*Changed files: 13 | Lines: +995 -8*
