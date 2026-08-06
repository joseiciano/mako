### Public & Auth
- **Landing Page (`/`)**: Product value proposition, feature highlights, and entry points.
- **Login / Sign Up (`/login`, `/register`)**: Authentication forms handled via Better Auth.

### Dashboard & Account
- **Dashboard (`/dashboard`)**: Central hub showing upcoming interviews and quick stats (credits + free Standard/AI balances).
    - **Data**: `GET /api/account`, `GET /api/interviews?status=scheduled`
- **Interviews History (`/interviews`)**: A comprehensive list of all past and upcoming sessions.
    - **Data**: `GET /api/interviews`
- **Billing & Credits (`/billing`)**: Balance summary from `GET /api/account`; credit package selection from `GET /api/payments/packages` with single-package selection, and `POST /api/payments/create-intent` to initiate a Stripe Payment Intent (returns a client secret). Checkout/payment confirmation is handled in a later story.
    - **Data**: `GET /api/account`, `GET /api/payments/packages`, `POST /api/payments/create-intent`
    - **Scope Note**: Payment amounts are never derived client-side; the backend package config is authoritative. Selected package and transient create-intent state are local to the billing smart component.
- **Settings & Profile (`/settings`)**: Manage profile, employment history, and interviewer verification.
    - **Data**: `GET /api/account`, `PATCH /api/account`, `GET /api/interviewer/status`, `GET /api/companies`

### Interview Lifecycle
- **Schedule Interview (`/interviews/new`)**: Configuration flow for type (System Design), mode (AI / P2P via availability), and timing/availability details.
    - **Data**: `POST /api/interviews` (**AI-led only**), `POST /api/availability` (**P2P matching path**)
    - **Policy Note**: Account tier/policy (for example free vs subscribed) is resolved server-side; scheduling UI does not submit a user-selected `tier` field.
    - **Create Matrix Note**: Direct create UI must not expose an `interviewer_id` picker for Milestone 2 and should treat direct `peer_to_peer` submissions as unsupported, routing Standard sessions through availability matching instead.
    - **Scope Note**: Current Story 5 UI implementation scope is `system_design` type selection. Additional API-documented interview types remain forward-compatible contract surface for later UI expansion.
- **Interview Details (`/interviews/:id`)**: Comprehensive view of a specific interview's status and metadata.
    - **Implementation Status**: Core API route `GET /api/interviews/:id` is live and consumed by Interview Details, Interview Session, and Post-Interview Feedback pages. Session start/end/timer frontend controls are implemented on `/interviews/:id/session` through Story 3.11.
    - **Features**: Recording playback, whiteboard screenshots, feedback summary, and participant info.
    - **Data**: `GET /api/interviews/:id`
- **Interview Session (`/interviews/:id/session`)**: The immersive interview environment.
    - **Features**: Realtime Video/Audio, Shared Excalidraw Whiteboard, Session Timer.
    - **Data**: `GET /api/interviews/:id`, `POST /api/interviews/:id/provision` (returns `mode`, Realtime `realtime_session_id` + token, and Excalidraw `excalidraw_room_id` + `excalidraw_key`), `POST /api/interviews/:id/start`, `POST /api/interviews/:id/end`, `POST /api/interviews/:id/ai-chat` (**AI-led only**)
    - **Notes**:
      - Whiteboard integration is complete with Excalidraw collaboration (Stories 3.3/3.4). The session page renders the full whiteboard UI after provision.
      - Real-time media integration is complete with Cloudflare RealtimeKit (Story 3.6).
      - `peer_to_peer` sessions share one room/key pair across both participants.
      - `ai_led` sessions use a single-user room/key pair plus chat guidance.
      - AI chat guidance uses Excalidraw JSON snapshots as source-of-truth input; Mermaid is optional derived output for reporting/export.
      - **AI Coach Chat**: The AI-led (but not peer-to-peer) session renders an `AIChatSmart` panel that submits each user turn with the current Excalidraw canvas snapshot to `POST /api/interviews/:id/ai-chat`. The panel captures the canvas scene on-demand at submit time (not per-stroke), renders loading/success/failure states, and supports retry without a full session reload. Implemented via `apps/frontend/src/components/interviews/ai-chat/` and wired in `session-dumb.tsx` gated on `mode === 'ai_led'` through Story 4.4.
      - Lifecycle/timer UI must consume backend-backed interview status and workflow-backed timer state rather than local-only inferred countdown state.
      - `Start Session` / `End Session` controls are participant-scoped lifecycle actions, not whiteboard provisioning actions.
      - Session timer/start/end controls are owned by the dedicated lifecycle stories and routes, not by whiteboard provisioning or the details consumer rollout.
      - **Lifecycle control dependencies**: `POST /api/interviews/:id/start`, `POST /api/interviews/:id/end`. Timer fields `started_at`, `expires_at`, `warning_at` on `InterviewDetail`.
      - **Retry safety**: Frontend retries of start/end are safe — backend guards transitions atomically and emits `start_requested`/`start_succeeded`/`end_requested`/`end_succeeded` lifecycle events with no sensitive data.
      - **State ownership**: Lifecycle controls and timer state derive from `useInterviewDetail` (TanStack Query); TanStack Store is reserved for local UI-only feedback such as lifecycle mutation errors. The countdown is derived from server-backed `expires_at`/`warning_at`, not stored as server state locally.
      - **Voice Wrapper Contract**: Voice is an ephemeral runtime wrapper only, scoped to `mode = 'ai_led'` sessions on this page. Speech-to-text submits the same `message` field and full existing request contract to `POST /api/interviews/:id/ai-chat`; text-to-speech playback renders the same `reply` field from the response. Voice introduces no new backend route, no new request/response field, no persisted interview schema field, and no lifecycle state. Voice does not bypass or own `POST /api/interviews/:id/provision`, `POST /api/interviews/:id/start`, or `POST /api/interviews/:id/end`; those routes exclusively own provisioning and lifecycle boundaries. Microphone capture, transcription, playback, and fallback UI are later implementation scope and are not introduced here.
- **Post-Interview Feedback (`/interviews/:id/feedback`)**: Detailed report and AI-driven insights.
    - **Features**: Performance scores, transcript, and whiteboard captures.
    - **Data**: `GET /api/interviews/:id`

### Route/Story Tracking Note
- `GET /api/interviews/:id` is now implemented and consumed by downstream details/session/feedback pages through `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-9-interview-details-route-get-api-interviews-id.md`.
- `POST /api/interviews/:id/provision` is documented as a join-time lifecycle dependency but is explicitly out of Milestone 2 Story 3 CRUD scope; follow-up ownership is `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-2-whiteboard-provision-contract-and-backend-wiring.md`.
- Lifecycle start/end route ownership is split across dedicated Milestone 3 stories:
  - `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-8-session-lifecycle.md`
  - `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-10-session-workflow-timer-orchestration.md`
  - `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-11-session-lifecycle-frontend-controls-and-timer.md`
  - `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-12-session-lifecycle-concurrency-and-observability.md`
- `POST /api/interviews/:id/ai-chat` is an AI-led interview route and should be delivered in dedicated AI-interviewer stories (Milestone 4 scope), beginning with `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-1-ai-chat-shared-contracts-and-module-wiring.md` and continuing through the Milestone 4 AI chat subtasks.
- Keep downstream lifecycle start/end/timer and AI integrations tied to dedicated follow-up stories; details/session/feedback read consumers are complete.
