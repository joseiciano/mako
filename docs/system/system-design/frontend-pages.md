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
- **Schedule Interview (`/interviews/new`)**: Configuration flow for type (System Design), mode (AI / P2P via availability), and tier.
    - **Data**: `POST /api/interviews` (**AI-led only**), `POST /api/availability` (**P2P matching path**)
- **Interview Details (`/interviews/:id`)**: Comprehensive view of a specific interview's status and metadata.
    - **Features**: Recording playback, whiteboard screenshots, feedback summary, and participant info.
    - **Data**: `GET /api/interviews/:id`
- **Interview Session (`/interviews/:id/session`)**: The immersive interview environment.
    - **Features**: Realtime Video/Audio, Shared Excalidraw Whiteboard, Session Timer.
    - **Data**: `GET /api/interviews/:id`, `POST /api/interviews/:id/provision`
    - **Notes**: Initially has a blank page and a join button, giving minimum details about the interview (i.e. "Scheduled System Design Interview With (Name)")
- **Post-Interview Feedback (`/interviews/:id/feedback`)**: Detailed report and AI-driven insights.
    - **Features**: Performance scores, transcript, and whiteboard captures.
    - **Data**: `GET /api/interviews/:id`

### Route/Story Tracking Note
- `GET /api/interviews/:id` and `POST /api/interviews/:id/provision` are documented system routes but explicitly out of scope in Story 3 (`docs/product/stories/stories/milestone-2-interview-scheduling-dashboard/interview-crud.md`).
- Keep them tied to dedicated follow-up stories before full rollout of details/session pages.
