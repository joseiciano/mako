# Story 4.8: Immediate AI Session Handoff and Lifecycle-Safe Routing

**Milestone**: Milestone 4: AI Interviewer Implementation
**Description**: Deliver post-create immediate AI session handoff so users land in session flow right away without breaking provision, start, or timer ownership.
**Status**: Todo
**Prerequisites**:
- `docs/system/system-design/api-routes.md`
- `docs/system/system-design/frontend-pages.md`
- `docs/system/system-design/state-management-lifecycle.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-8-session-lifecycle.md`
- `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-11-session-lifecycle-frontend-controls-and-timer.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-4-frontend-ai-led-session-chat-panel.md`
- `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-7-immediate-ai-session-entry-and-guardrails.md`

## What Needs to Be Done

### 1. Implement immediate-session success handoff
- [ ] On successful immediate AI creation, route user into documented interview session surface (`/interviews/:id/session`) instead of treating flow like ordinary future scheduling continuity.
- [ ] Keep success UX explicit that session is available immediately while runtime controls still follow normal provision and start route boundaries.

### 2. Preserve provision and lifecycle ownership boundaries
- [ ] Keep join-time provisioning ownership on `POST /api/interviews/:id/provision`; immediate mode must not move Realtime or Excalidraw credential creation into `POST /api/interviews`.
- [ ] Keep lifecycle transition ownership on `POST /api/interviews/:id/start`; immediate mode must not introduce a new persisted status or hidden client-only lifecycle state.
- [ ] Keep timer ownership aligned with documented Milestone 3 lifecycle behavior after handoff.

### 3. Keep session-ready UX compatible with AI-led runtime features
- [ ] Ensure immediate-mode handoff lands in session UI that stays compatible with existing join, start, and timer controls.
- [ ] Ensure AI-led session surface can load documented AI chat behavior after session handoff without coupling immediate mode to voice or transcript features.

### 4. Add handoff integration coverage
- [ ] Add tests covering accepted immediate AI create flow through post-create navigation into `/interviews/:id/session`.
- [ ] Add tests proving immediate mode does not bypass provision or start ownership after handoff.
- [ ] Add tests proving failed handoff states remain user-actionable without implying interview has already been provisioned or started.

## Implementation Notes
- Immediate mode here is handoff and routing scope, not new lifecycle model scope.
- Do not add auto-start behavior, hidden client-only started state, or provisioning side effects during `POST /api/interviews` creation.
- Voice I/O, transcription, and post-interview feedback remain out of scope.

## End Goal
User who creates AI "Start Now" interview lands in session flow immediately, with no drift from documented provision, lifecycle start, or timer ownership boundaries.
