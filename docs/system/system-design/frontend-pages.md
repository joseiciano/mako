### Public & Auth
- **Landing Page (`/`)**: Product value proposition, feature highlights, and entry points.
- **Login / Sign Up (`/login`, `/register`)**: Authentication forms handled via Better Auth.

### Dashboard & Account
- **Dashboard (`/dashboard`)**: Central hub showing upcoming interviews and quick stats (credits + free Standard/AI balances).
    - **Data**: `GET /api/account`, `GET /api/interviews?status=scheduled`
- **Interviews History (`/interviews`)**: A comprehensive list of all past and upcoming sessions.
    - **Data**: `GET /api/interviews`
- **Billing & Credits (`/billing`)**: Page to purchase credit packages via Stripe.
    - **Data**: `GET /api/account`, `POST /api/payments/create-intent`
- **Settings & Profile (`/settings`)**: Manage profile, employment history, and interviewer verification.
    - **Data**: `GET /api/account`, `PATCH /api/account`, `GET /api/interviewer/status`, `GET /api/companies`

### Interview Lifecycle
- **Schedule Interview (`/interviews/new`)**: Configuration flow for type (System Design), mode (AI / P2P via availability), and timing/availability details.
    - **Data**: `POST /api/interviews` (**AI-led only**), `POST /api/availability` (**P2P matching path**)
    - **Policy Note**: Account tier/policy (for example free vs subscribed) is resolved server-side; scheduling UI does not submit a user-selected `tier` field.
    - **Create Matrix Note**: Direct create UI must not expose an `interviewer_id` picker for Milestone 2 and should treat direct `peer_to_peer` submissions as unsupported, routing Standard sessions through availability matching instead.
    - **Scope Note**: Current Story 5 UI implementation scope is `system_design` type selection. Additional API-documented interview types remain forward-compatible contract surface for later UI expansion.
- **Interview Details (`/interviews/:id`)**: Comprehensive view of a specific interview's status and metadata.
    - **Implementation Status**: Core API route `GET /api/interviews/:id` is live. Full Interview Details / Session / Feedback page rollout remains follow-up work tied to later lifecycle stories.
    - **Features**: Recording playback, whiteboard screenshots, feedback summary, and participant info.
    - **Data**: `GET /api/interviews/:id`
- **Interview Session (`/interviews/:id/session`)**: The immersive interview environment.
    - **Features**: Realtime Video/Audio, Shared Excalidraw Whiteboard, Session Timer.
    - **Data**: `GET /api/interviews/:id`, `POST /api/interviews/:id/provision`, `POST /api/interviews/:id/ai-chat` (**AI-led only**)
    - **Notes**:
      - Initial UX can be a minimal shell with interview context + explicit join CTA.
      - `peer_to_peer` sessions share one room/key pair across both participants.
      - `ai_led` sessions use a single-user room/key pair plus chat guidance.
      - AI chat guidance uses Excalidraw JSON snapshots as source-of-truth input; Mermaid is optional derived output for reporting/export.
- **Post-Interview Feedback (`/interviews/:id/feedback`)**: Detailed report and AI-driven insights.
    - **Features**: Performance scores, transcript, and whiteboard captures.
    - **Data**: `GET /api/interviews/:id`

### Route/Story Tracking Note
- `GET /api/interviews/:id` is now implemented and available as lifecycle page dependency. Remaining ownership in `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-9-interview-details-route-get-api-interviews-id.md` covers downstream details/session/feedback page rollout and integration work, not initial route delivery.
- `POST /api/interviews/:id/provision` is documented as a join-time lifecycle dependency but is explicitly out of Milestone 2 Story 3 CRUD scope; follow-up ownership is `docs/product/stories/stories/milestone-3-the-interview-experience-p2p-core/3-2-whiteboard-provision-contract-and-backend-wiring.md`.
- `POST /api/interviews/:id/ai-chat` is an AI-led interview route and should be delivered in dedicated AI-interviewer stories (Milestone 4 scope), starting with `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/2-1-ai-chat-route-and-canvas-guidance.md`.
- Keep downstream lifecycle pages and integrations tied to dedicated follow-up stories until full details/session/feedback rollout is complete.
