## AI Code Review

**Decision**: significant_concerns
**Reason**: `GET /api/interviews` now returns session/detail fields for every list item, including `excalidraw_key`. That broadens secret exposure and summary-route scope enough that it should be fixed before merge.

---

### Code Quality
**Status**: issues_found
**Recommendation**: 💬 Optional Nits
**Summary**: One contract-validation nit remains after deduplication.

- `packages/shared/src/interviews.ts:47` — `feedback` is validated with `z.any().nullable()`, which removes runtime validation and type safety for a persisted JSONB field. How to fix it: replace `z.any()` with a JSON-compatible schema such as `z.record(z.string(), z.unknown())` or a dedicated feedback schema if the shape is already known. [SUGGESTION]

---

### Security
**Status**: issues_found
**Recommendation**: 🔴 Serious Concerns
**Summary**: The list route now exposes sensitive interview/session detail fields in bulk responses.

- `packages/shared/src/interviews.ts:52`, `packages/shared-backend/src/interviews/interview-repository.ts:613` — The list contract now reuses the full interview schema, and the participant list SQL now selects `realtime_session_id`, `excalidraw_room_id`, `excalidraw_key`, `recording_url`, `screenshot_urls`, and `feedback` for every `/api/interviews` row. That unnecessarily exposes whiteboard/session secrets and detail-only data to the browser on a bulk dashboard route. How to fix it: restore a summary-only `interviewListItemSchema`, remove those detail/session columns from `buildListParticipantInterviewsQuery`, and only return them from participant-scoped detail/provision endpoints that explicitly need them. [BLOCKING]

---

### Performance
**Status**: lgtm
**Recommendation**: ✅ Approve
**Summary**: No separate performance issues remain after deduplication.

No issues found.

---

### Documentation
**Status**: lgtm
**Recommendation**: ✅ Approve
**Summary**: No separate documentation issues remain after deduplication.

No issues found.

---

*Review generated from diff of `c249a9edf515fd3b6e0f33244e394bfabfb2bd88` .. `HEAD` against `origin/main`.*
*Changed files: 13 | Lines: +995 -8*
