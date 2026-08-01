# API Routes

> **Note**: All routes defined below, and any future routes added to the system, must support an OpenAPI specification (Swagger) to ensure consistent documentation, ease of reference, and readability for all developers.

### Authentication (Better Auth)
- **`POST /api/auth/sign-up`**
  - **Description**: Registers a new user account using email/password or social providers.
  - **Request Body**: `{ email, password, name }`
  - **Response Body**: `{ user: User, session: Session }`

- **`POST /api/auth/sign-in`**
  - **Description**: Authenticates a user and establishes a secure session cookie.
  - **Request Body**: `{ email, password }`
  - **Response Body**: `{ user: User, session: Session }`

- **`POST /api/auth/sign-out`**
  - **Description**: Invalidates the current session and clears authentication cookies.
  - **Request Body**: None
  - **Response Body**: `{ success: boolean }`

- **`GET /api/auth/get-session`**
  - **Description**: Validates the current session and returns the authenticated user's data.
  - **Request Body**: None
  - **Response Body**: `{ user: User, session: Session } | null`

### Account Management
- **`GET /api/account`**
  - **Description**: Retrieves the current authenticated user's profile, credit balance, and remaining free interview quotas.
  - **Request Body**: None
  - **Response Body**:
    ```json
    {
      "id": "uuid",
      "email": "user@example.com",
      "displayName": "Jane Candidate",
      "credits": 8,
      "freeStandardInterviews": 1,
      "freeAiInterviews": 1,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
    ```
  - **Field Mapping**: API response uses camelCase JSON fields mapped from DB columns `name`, `credits`, `free_standard_interviews`, `free_ai_interviews`, `created_at`.
  - **Query Params**: None

- **`PATCH /api/account`**
  - **Description**: Updates user profile information (display name).
  - **Request Body**: `{ displayName: string }`
  - **Response Body**: Same shape as `GET /api/account`.
  - **Query Params**: None

- **`DELETE /api/account`**
  - **Description**: Soft-deletes the user's account and cancels all active sessions.
  - **Request Body**: None
  - **Response Body**: `{ success: boolean }`
  - **Query Params**: None

### Interviewer Onboarding
- **`POST /api/interviewer/apply`**
  - **Description**: Submits an application to become a verified interviewer.
  - **Request Body**: `{ email: string, employment_history: Array<{ company: string, role: string, start: string, end: string }> }`
  - **Response Body**: `{ application: User_Interviewer_Application }`
  - **Query Params**: None

- **`GET /api/interviewer/status`**
  - **Description**: Retrieves the status of the current user's interviewer application.
  - **Request Body**: None
  - **Response Body**: `{ application: User_Interviewer_Application | null }`
  - **Query Params**: None

### Payments & Credits
- **`GET /api/payments/packages`**
  - **Description**: Returns the list of available credit packages (server-side source of truth for price-to-credit mapping). Authenticated route.
  - **Request Body**: None
  - **Response Body**:
    ```json
    {
      "packages": [
        {
          "package_id": "credits_5",
          "display_name": "5 Credits",
          "amount_cents": 2500,
          "credits_granted": 5
        },
        {
          "package_id": "credits_10",
          "display_name": "10 Credits",
          "amount_cents": 4500,
          "credits_granted": 10
        },
        {
          "package_id": "credits_20",
          "display_name": "20 Credits",
          "amount_cents": 8000,
          "credits_granted": 20
        }
      ]
    }
    ```
  - **Field Mapping**: `amount_cents` is the Stripe Payment Intent amount in USD cents. `credits_granted` is the number of interview credits granted on successful payment. The frontend must not derive credit amounts independently.
  - **Query Params**: None

- **`POST /api/payments/create-intent`**
  - **Description**: Generates a Stripe Payment Intent for purchasing interview credits.
  - **Request Body**: `{ package_id: string }`
  - **Response Body**: `{ client_secret: string }`
  - **Behavior Rules**:
    - Route is authenticated; unauthenticated requests receive 401.
    - `package_id` is validated against the server-side package configuration; unknown packages are rejected with 400.
    - Creates a Stripe Payment Intent with `amount` resolved from the package config, `currency: "usd"`, and `metadata` containing `package_id` and `user_id`.
    - Does not store the Payment Intent at creation time; the webhook handler creates the authoritative transaction record.
    - Credit balance does not change until the webhook processes `payment_intent.succeeded`.
  - **Query Params**: None

- **`POST /api/payments/webhook`**
  - **Description**: Stripe webhook handler for fulfilling credit purchases. (Internal only)
  - **Request Body**: `Stripe.Event`
  - **Response Body**: `200 OK`
  - **Behavior Rules**:
    - Verifies the Stripe webhook signature using `STRIPE_WEBHOOK_SECRET` before processing; invalid signatures return 400.
    - Handles `payment_intent.succeeded`: resolves `credits_granted` from package config via `metadata.package_id` and grants credits via the credit service. Idempotent via the unique constraint on `Credit_Transactions.stripe_payment_intent_id`.
    - Handles `payment_intent.payment_failed`: logs the failure with payment intent id and user context; does not affect balances.
    - Returns `200 OK` for all recognized event types to acknowledge receipt.
    - Does not send email or push notifications (notification scope belongs to the notification service).
  - **Query Params**: None

### Interviews
- **`POST /api/interviews`**
  - **Description**: Schedules or initializes a new interview session.
  - **Current Milestone 2 Contract**:
    - Direct creation is supported for **AI-led** sessions.
    - Direct **peer-to-peer** creation is not supported; peer-to-peer Standard sessions are created by the Availability + Greedy Matcher flow.
    - Client payload does **not** set `tier`; effective interview tier/policy is resolved server-side from account state (for example: free vs subscribed) and quota/credit rules.
    - `interviewer_id` is out of scope for this route contract and must not be provided.
    - Default policy resolution examples:
      - `free_ai_interviews > 0` → request is accepted and consumes free AI quota with resolved tier label `standard` by default policy config.
      - `free_ai_interviews = 0` and `credits > 0` → request is accepted and consumes one credit with resolved tier label `premium` by default policy config.
      - `free_ai_interviews = 0` and `credits = 0` → request is rejected with an explicit business-rule error.
    - Rejected combinations:
      - `mode: 'peer_to_peer'`
      - any request containing `interviewer_id`
      - any request containing client-selected `tier`
  - **Workflow**:
    - **Scheduled Sessions**: After successful validation and policy reservation, persists the interview record. Confirmation/reminder orchestration is not part of the current create-route runtime behavior.
    - **Immediate AI Sessions**: If `mode: 'ai_led'` and `scheduled_at` is set to `'now'`, the interview is created with immediate timing semantics, but realtime/whiteboard provisioning remains join-time via `POST /api/interviews/:id/provision` (not in create-route transaction scope).
  - **Request Body**: `{ type: 'system_design' | 'coding' | 'behavioral', mode: 'ai_led', scheduled_at: ISO-8601 timestamp string | 'now' }`
  - **Response Body**: `{ interview: Interview }`
  - **Query Params**: None

- **`GET /api/interviews`**
  - **Description**: Lists interviews for the current user as a narrow summary.
  - **Request Body**: None
  - **Response Body**:
    ```json
    {
      "interviews": [
        {
          "id": "uuid",
          "scheduler_id": "uuid",
          "scheduler_alias": "Candidate-Blue",
          "interviewer_id": null,
          "interviewer_alias": "Interviewer-Red",
          "type": "system_design",
          "mode": "peer_to_peer",
          "tier": "standard",
          "status": "scheduled",
          "scheduled_at": "2026-01-01T12:00:00.000Z",
          "created_at": "2026-01-01T00:00:00.000Z",
          "updated_at": "2026-01-01T00:00:00.000Z"
        }
      ]
    }
    ```
  - **Field Mapping**: API response uses snake_case and maps directly to DB columns.
  - **Summary-only Contract**: The list response intentionally excludes detail-only fields (`realtime_session_id`, `excalidraw_room_id`, `excalidraw_key`, `recording_url`, `screenshot_urls`, `feedback`). Use `GET /api/interviews/:id` for the full detail payload.
  - **Role Semantics**:
    - For matcher-created peer-to-peer interviews, `scheduler_id` / `interviewer_id` are assigned deterministically from matched request order `(created_at ASC, id ASC)`.
    - For direct route-created sessions in Milestone 2, `scheduler_id` is the authenticated creator.
  - **Query Params**: `status?: 'scheduled' | 'ongoing' | 'completed' | 'cancelled'`, `limit?: number`, `offset?: number`

- **`POST /api/interviews/:id/cancel`**
  - **Description**: Cancels a scheduled interview.
  - **Request Body**: None
  - **Response Body**: `{ success: boolean }`
  - **Query Params**: None

- **`POST /api/interviews/:id/provision`**
  - **Description**: Provisions (or returns existing) Cloudflare Realtime + Excalidraw collaboration credentials for interview join. This is the join-time credential route.
  - **Request Body**: None
  - **Response Body**:
    ```json
    {
      "mode": "peer_to_peer",
      "realtime": {
        "realtime_session_id": "rt_session_123",
        "token": "rt_token_abc"
      },
      "excalidraw": {
        "excalidraw_room_id": "wb_room_123",
        "excalidraw_key": "wb_key_abc"
      }
    }
    ```
  - **Canonical Provision Contract**: Response field names intentionally match persisted interview columns where applicable. `realtime.realtime_session_id` maps to `interviews.realtime_session_id`; `excalidraw.excalidraw_room_id` maps to `interviews.excalidraw_room_id`; `excalidraw.excalidraw_key` maps to `interviews.excalidraw_key`. `realtime.token` is an ephemeral join token and is not stored on the interview row.
  - **Mode Contract**: `mode` is either `peer_to_peer` or `ai_led` and determines whether credentials represent a shared two-participant collaboration room or a single-user interview-scoped room.
  - **Behavior Rules**:
    - Route is participant-only (interview participants can provision/join; non-participants are rejected).
    - Provisioning is join-time runtime behavior and does not introduce a separate persisted interview `status`.
    - Retries/reconnects for the same active interview are idempotent and must reuse existing persisted values when present.
    - `peer_to_peer`: both participants receive credentials for the same shared room/key pair.
    - `ai_led`: return a single-user room/key pair scoped to the interview.
    - Credentials returned here are not exposed through `GET /api/interviews`; use this route at join-time.
  - **Query Params**: None
  - **Telemetry**: Structured logs are emitted at provision lifecycle points: `interview.provision_start` (with `interview_id`, `participant_user_id`), `interview.provision_success` (with `interview_id`, `outcome`), and `interview.provision_failure` (with `interview_id`, `error_type`). Logs must not leak sensitive collaboration credentials (`excalidraw_key`, realtime tokens).

- **`POST /api/interviews/:id/start`**
  - **Description**: Starts an interview session for a participant and transitions lifecycle state from `scheduled` to `ongoing` when valid.
  - **Request Body**: None
  - **Response Body**:
    ```json
    {
      "success": true,
      "interview": {
        "id": "uuid",
        "scheduler_id": "uuid",
        "scheduler_alias": "Candidate-Blue",
        "interviewer_id": "uuid",
        "interviewer_alias": "Interviewer-Red",
        "type": "system_design",
        "mode": "peer_to_peer",
        "tier": "standard",
        "status": "ongoing",
        "scheduled_at": "2026-04-10T10:30:00.000Z",
        "recording_url": null,
        "screenshot_urls": null,
        "feedback": null,
        "created_at": "2026-04-01T10:00:00.000Z",
        "updated_at": "2026-04-10T10:30:00.000Z"
      }
    }
    ```
  - **Behavior Rules**:
    - Route is participant-only; unauthenticated requests receive 401; missing or non-participant requests receive 404.
    - Valid transition: `scheduled -> ongoing`.
    - Idempotent retry: repeated `start` on already `ongoing` interview returns `{ success: true, interview }` without conflicting state mutation.
    - Invalid transitions (`cancelled -> start`, `completed -> start`) are rejected with 409 without state mutation.
    - Successful `start` is the persisted lifecycle boundary that triggers active workflow timer orchestration (60-minute session, 5-minute warning).
    - Start is atomic guarded (`AND status = 'scheduled'`) and idempotent on retry (`already_ongoing`). Concurrent starts converge to one deterministic `ongoing` state.
    - Response uses credential-safe `InterviewDetail` schema (excludes `realtime_session_id`, `excalidraw_room_id`, `excalidraw_key`).
  - **Telemetry**: Structured logs emit `start_requested` and `start_succeeded` with safe context (`interview_id`, `participant_user_id`, `action`, `outcome`, `status`, timer fields). No secrets logged.
  - **Query Params**: None

- **`POST /api/interviews/:id/end`**
  - **Description**: Ends an active interview session for a participant and transitions lifecycle state from `ongoing` to `completed` when valid.
  - **Request Body**: None
  - **Response Body**:
    ```json
    {
      "success": true,
      "interview": {
        "id": "uuid",
        "scheduler_id": "uuid",
        "scheduler_alias": "Candidate-Blue",
        "interviewer_id": "uuid",
        "interviewer_alias": "Interviewer-Red",
        "type": "system_design",
        "mode": "peer_to_peer",
        "tier": "standard",
        "status": "completed",
        "scheduled_at": "2026-04-10T10:30:00.000Z",
        "recording_url": null,
        "screenshot_urls": null,
        "feedback": null,
        "created_at": "2026-04-01T10:00:00.000Z",
        "updated_at": "2026-04-10T11:30:00.000Z"
      }
    }
    ```
  - **Behavior Rules**:
    - Route is participant-only; unauthenticated requests receive 401; missing or non-participant requests receive 404.
    - Valid transition: `ongoing -> completed`.
    - Idempotent retry: repeated `end` on already `completed` interview returns `{ success: true, interview }` without conflicting state mutation.
    - Invalid transitions (`scheduled -> end`, `cancelled -> end`) are rejected with 409 without state mutation.
    - Manual `end` persists the terminal lifecycle state; timer timeout convergence is handled by the same atomic guarded transition (concurrent manual end and timer completion both converge to `completed`).
    - Response uses credential-safe `InterviewDetail` schema (excludes `realtime_session_id`, `excalidraw_room_id`, `excalidraw_key`).
  - **Telemetry**: Structured logs emit `end_requested` and `end_succeeded` with safe context (`interview_id`, `participant_user_id`, `action`, `outcome`, `status`). No secrets logged.
  - **Query Params**: None

- **`POST /api/interviews/:id/ai-chat`**
  - **Description**: Submits a user chat turn for AI-led interviews and returns guidance/review grounded in chat context + Excalidraw canvas snapshot.
  - **Request Body**:
    ```json
    {
      "message": "What should I add next?",
      "canvas_snapshot": {
        "type": "excalidraw_scene",
        "scene": {}
      },
      "guidance_mode": "review"
    }
    ```
  - **Response Body**:
    ```json
    {
      "reply": "You're missing a cache invalidation strategy between services A and B.",
      "guidance_mode": "review",
      "prompt_version": "ai-whiteboard-v1"
    }
    ```
  - **Behavior Rules**:
    - Route is only valid for `mode = 'ai_led'` interviews.
    - Route is participant-only.
    - Canvas input should be Excalidraw JSON (or server-side normalized derivative). Mermaid is optional downstream output, not required request input.
    - Clients should send snapshots on explicit review actions and/or debounced intervals (not per-stroke).
  - **Query Params**: None

- **`GET /api/interviews/:id`**
  - **Description**: Retrieves the interview detail payload for a participant. Includes detail-only fields such as `recording_url`, `screenshot_urls`, and `feedback`. Collaboration credentials (`realtime_session_id`, `excalidraw_room_id`, `excalidraw_key`) are provision-only and remain available via `POST /api/interviews/:id/provision`.
  - **Request Body**: None
  - **Response Body**:
    ```json
    {
      "interview": {
        "id": "uuid",
        "scheduler_id": "uuid",
        "scheduler_alias": "Candidate-Blue",
        "interviewer_id": null,
        "interviewer_alias": "Interviewer-Red",
        "type": "system_design",
        "mode": "peer_to_peer",
        "tier": "standard",
        "status": "scheduled",
        "scheduled_at": "2026-01-01T12:00:00.000Z",
        "recording_url": "https://r2.example.com/recording.mp4",
        "screenshot_urls": ["https://r2.example.com/ss1.png"],
        "feedback": {
          "overall_score": 85,
          "strengths": ["Good communication"],
          "improvements": ["System design depth"]
        },
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      }
    }
    ```
  - **Participant Scope**: Only the interview scheduler or interviewer can access this route. Non-participants receive a 404.
  - **Query Params**: None

### Availability
- **`POST /api/availability`**
  - **Description**: Submits a new availability request with one or more time slots.
  - **Request Body**: `{ interview_type: 'system_design' | 'coding' | 'behavioral', max_matches: number, slots: Array<{ start_time: string, end_time: string }> }`
  - **Response Body**: `{ request: Availability_Request, slots: Availability_Slot[] }`
  - **Validation Rules**:
    - Each slot must be exactly 60 minutes (`end_time = start_time + 60m`).
    - `start_time < end_time`.
    - `max_matches` must be a positive integer.
    - `slots` array must contain 1 to 200 items.
    - Duplicate slot windows (same `start_time` and `end_time`) are not allowed in a single request.

- **`GET /api/availability`**
  - **Description**: Lists active availability requests for the current user.
  - **Response Body**: `{ requests: Array<Availability_Request & { slots: Availability_Slot[] }> }`

- **`DELETE /api/availability/:id`**
  - **Description**: Cancels an active availability request and its associated slots.
  - **Response Body**: `{ success: boolean }`

### Companies
- **`POST /api/companies`**
  - **Description**: Adds a new company experience to the user's profile.
  - **Request Body**: `{ company: string, joined: string }`
  - **Response Body**: `{ company: User_Company }`
  - **Query Params**: None

- **GET /api/companies**
  - **Description**: Retrieves the list of companies associated with the user.
  - **Request Body**: None
  - **Response Body**: `{ companies: User_Company[] }`
  - **Query Params**: None
