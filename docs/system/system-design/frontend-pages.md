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
    - **Scope Note**: Current Story 5 UI implementation scope is `system_design` type selection. Additional API-documented interview types remain forward-compatible contract surface for later UI expansion.
- **Interview Details (`/interviews/:id`)**: Comprehensive view of a specific interview's status and metadata.
    - **Implementation Status**: Documented target route. Treat behavior as story-gated until the dedicated details/session follow-up stories are completed.
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
- `GET /api/interviews/:id` and `POST /api/interviews/:id/provision` are documented system routes but explicitly out of scope in Story 3.1 (`docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/3-1-interview-crud-scope-and-source-lock.md`).
- `POST /api/interviews/:id/ai-chat` is an AI-led interview route and should be delivered in dedicated AI-interviewer stories (Milestone 4 scope), starting with `docs/product/stories/stories/milestone-4-ai-interviewer-implementation/2-1-ai-chat-route-and-canvas-guidance.md`.
- Keep them tied to dedicated follow-up stories before full rollout of details/session pages.
