# Documentation Drift Resolution Plan

## Aggregated Drift Findings

Error 1: Broken prerequisite link in Layout Story 3.1
- File 1: `docs/product/stories/stories/milestone-1-foundation-authentication/3-1-layout-app-shell.md` (line 6) references `./account-management.md`.
- File 2: `docs/product/stories/stories/milestone-1-foundation-authentication/` contains `2-1-user-profile-quotas.md`, `2-2-professional-history-management.md`, and `2-3-account-security-deletion.md` (no `account-management.md`).
- Reason why this is a drift: The prerequisite points to a non-existent story, so dependency traceability is broken.

Error 2: Invalid cross-story reference for hamburger implementation
- File 1: `docs/product/stories/stories/milestone-1-foundation-authentication/3-1-layout-app-shell.md` (line 37) says hamburger is "to be implemented in 1.7".
- File 2: `docs/product/stories/stories/milestone-1-foundation-authentication/3-2-mobile-nav.md` defines the actual hamburger/mobile-nav implementation.
- Reason why this is a drift: Story reference numbering is incorrect and points to a non-existent/incorrect ticket, creating sequencing ambiguity.

Error 3: Desktop navigation architecture conflict (top header nav vs persistent sidebar)
- File 1: `docs/product/stories/stories/milestone-1-foundation-authentication/3-1-layout-app-shell.md` (lines 29-30, 52) says desktop global nav is in the top header bar.
- File 2: `docs/product/stories/stories/milestone-1-foundation-authentication/3-2-mobile-nav.md` (line 25, line 43) says desktop uses a fixed/persistent sidebar.
- Reason why this is a drift: Two adjacent stories define different desktop navigation architectures without an explicit migration note.

Error 4: Duplicate "New Files" claims across sequential stories
- File 1: `docs/product/stories/stories/milestone-1-foundation-authentication/3-1-layout-app-shell.md` (lines 42-49) already marks app-shell/header/navigation files as new.
- File 2: `docs/product/stories/stories/milestone-1-foundation-authentication/3-2-mobile-nav.md` (lines 30-38) again marks overlapping files as new (e.g., `app-shell-*`, `header-dumb.tsx`, `navigation-dumb.tsx`).
- Reason why this is a drift: The change log of what is newly introduced vs modified is inconsistent, which weakens auditability of incremental story execution.

Error 5: Story format drift from required standard (legacy layout stories)
- File 1: `docs/product/stories/AGENTS.md` (lines 31-32, 57) requires `## What Needs to Be Done` as the standard ticket format.
- File 2: `3-1-layout-app-shell.md`, `3-2-mobile-nav.md`, and `3-3-layout-integration.md` use `## Implementation Plan` instead.
- Reason why this is a drift: Stories are not handled using one consistent format, making quality gates and reviews less uniform.

Error 6: Story file with incomplete ticket structure
- File 1: `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/scheduling-flow.md` (lines 1-4) only contains title/milestone/description/status.
- File 2: `docs/product/stories/AGENTS.md` (lines 31-48, 57) requires actionable checklist sections and end goal details.
- Reason why this is a drift: The story is missing required implementation detail scaffolding and cannot be reliably executed/reviewed.

Error 7: Frontend dependency naming mismatch (Lucia vs Lucide)
- File 1: `docs/infrastructure/frontend.md` (line 8) says the icon library is "Lucia".
- File 2: `docs/product/stories/stories/milestone-1-foundation-authentication/3-1-layout-app-shell.md` (line 26) specifies **Lucide** icons.
- Reason why this is a drift: Infra and product docs disagree on a core frontend dependency, which can mislead implementation decisions.

Error 8: Lifecycle docs do not define cancel transition matrix required by Story 3.7
- File 1: `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-7-interview-cancel-route-post-api-interviews-id-cancel.md` (line 16-18) requires valid-state cancellation rules from lifecycle docs.
- File 2: `docs/system/system-design/state-management-lifecycle.md` (lines 4-12) and `docs/system/system-design/diagrams.md` (lines 5-18) describe scheduling/provisioning/completion but do not define explicit cancellation transition rules.
- Reason why this is a drift: Story 3.7 depends on lifecycle source-of-truth that currently does not fully specify cancellation state transitions.

Error 9: Queue purpose drift between IaC story and current lifecycle/notification architecture
- File 1: `docs/product/stories/stories/milestone-1-foundation-authentication/1-2-cloud-infrastructure-iac.md` (lines 17, 19) defines queue usage as interview provisioning hand-off.
- File 2: `docs/infrastructure/backend.md` (line 10) defines queues for post-commit worker hand-off (matcher/API -> notification/provisioning workers).
- File 3: `docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/notification-service.md` (lines 21-33, 37-47) defines queue contract for post-commit lifecycle events.
- File 4: `docs/system/system-design/state-management-lifecycle.md` (line 10) and `docs/system/system-design/diagrams.md` (line 7) define session provisioning as join-time API behavior.
- Reason why this is a drift: One source says queues drive provisioning, while newer docs treat queues as post-commit orchestration transport and provisioning as join-time route behavior.

---

## Resolution Plan

1. **Fix broken references and numbering in Milestone 1 layout stories**
   - Update Story 3.1 prerequisite to real account story files.
   - Replace "1.7" hamburger reference with Story 3.2.

2. **Set a single canonical desktop navigation architecture**
   - Decide canonical desktop nav pattern (header-nav, sidebar-nav, or hybrid with explicit ownership).
   - Update Stories 3.1/3.2/3.3 so they narrate one consistent migration path.

3. **Normalize file-change bookkeeping in story docs**
   - Reclassify duplicate "New Files" entries in Story 3.2 as "Modified Files" where applicable.
   - Add short migration notes where a file was introduced in one story and extended in the next.

4. **Standardize story format for all active/legacy tickets**
   - Convert `Implementation Plan` sections to `What Needs to Be Done` for 3.1/3.2/3.3.
   - Expand `scheduling-flow.md` into a fully scoped story with checklist sections and explicit end goal.

5. **Align frontend dependency naming across docs**
   - Update `docs/infrastructure/frontend.md` from "Lucia" to "Lucide" (or document a deliberate alternate library choice everywhere if changed intentionally).

6. **Close lifecycle contract gap for cancellation rules**
   - Extend `state-management-lifecycle.md` and `diagrams.md` with explicit cancel transition matrix (allowed states, rejected states, idempotent retries).
   - Ensure Story 3.7 references those exact transition rules.

7. **Unify queue/provisioning architecture language**
   - Update Story 1.2 IaC wording so queue purpose matches current post-commit orchestration model.
   - If provisioning worker still exists, document whether it is route-invoked, queue-invoked, or both, and under which conditions.
   - Ensure `backend.md`, `management.md`, `notification-service.md`, and lifecycle docs use consistent transport boundaries.

8. **Run a docs consistency pass after edits**
   - Validate all internal links in changed story files.
   - Verify route, lifecycle, and infra terms are consistent across `docs/infrastructure`, `docs/system/system-design`, and `docs/product/stories`.
   - Add a short "Last reconciled" note in each updated doc set to mark drift resolution completion.
