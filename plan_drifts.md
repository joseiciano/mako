# Documentation Drift Reconciliation Plan

## P0 — Resolve hard contract conflicts first

- [x] **Unify account update method to `PATCH` everywhere**
  - **Edit:** `docs/system/system-design/diagrams.md:30`
    - Replace `GET/PUT/DELETE` → `GET/PATCH/DELETE`
  - **Edit:** `docs/system/diagrams/crud.md:26`
    - Replace `PUT/DELETE /api/account` → `PATCH/DELETE /api/account`

- [x] **Make P2P creation path consistent (no direct `POST /api/interviews`)**
  - Keep route contract as source of truth:
    - `docs/system/system-design/api-routes.md:83-94` (already aligned)
    - `docs/system/system-design/matching-tiers.md:7` (already aligned)
  - **Edit:** `docs/system/system-design/frontend-pages.md:16-17`
    - Current text implies AI/P2P both use `POST /api/interviews`
    - Suggested replacement:
      - “Schedule Interview … mode (AI / P2P via availability).”
      - Data: `POST /api/interviews` (**AI-led only**), `POST /api/availability` (**P2P matching path**)

- [x] **Align Premium semantics across design docs**
  - Canonical for Milestone 2: **Premium is policy input only; no separate creation flow yet**
  - **Edit:** `docs/system/system-design/db-schemas.md:89`
    - Replace wording `premium requires a verified interviewer` with wording that it is a policy label in M2; verified-interviewer flow is future milestone behavior.
  - **Edit:** `docs/system/system-design/concurrency-data-integrity.md:7`
    - Mark manual Premium “first-to-claim” as **future scope (Milestone 7)** or remove from M2 design docs.

## P1 — Resolve scope/expectation drift

- [x] **Fix initial-focus statement vs allowed interview types**
  - **Edit:** `docs/system/system-design.md:14-17`
    - Current says coding/behavioral are not initial focus, while API/DB allow them.
    - Choose one:
      1. Keep API/DB as-is and update text to “M2 UX prioritizes system design; coding/behavioral are contract-ready”, or
      2. Restrict API/DB contracts to `system_design` only for now.

## P2 — Clarify naming transformations to avoid implementation drift

- [x] **Document snake_case DB ↔ camelCase API mapping**
  - **Edit:** `docs/system/system-design/api-routes.md` (Account section)
    - Add explicit mapping note:
      - `displayName <- users.name`
      - `freeStandardInterviews <- users.free_standard_interviews`
      - `freeAiInterviews <- users.free_ai_interviews`
      - `createdAt <- users.created_at`
  - Alternative: standardize API docs on snake_case (would require broader frontend/docs updates).

## Optional cleanup (non-blocking)

- [x] **Track route-story gap explicitly**
  - `GET /api/interviews/:id` and `POST /api/interviews/:id/provision` appear in system docs/frontend pages but are out of scope in Story 3.
  - Add dedicated story tickets or “future ticket references” in:
    - `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/interview-crud.md`
    - `docs/system/system-design/frontend-pages.md`
