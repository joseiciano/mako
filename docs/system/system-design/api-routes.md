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
      "display_name": "Jane Candidate",
      "credits": 8,
      "free_standard_interviews": 1,
      "free_ai_interviews": 1,
      "created_at": "2026-01-01T00:00:00.000Z"
    }
    ```
  - **Field Mapping**: API response uses snake_case and maps directly to DB columns.
  - **Query Params**: None

- **`PATCH /api/account`**
  - **Description**: Updates user profile information (display name).
  - **Request Body**: `{ display_name: string }`
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
- **`POST /api/payments/create-intent`**
  - **Description**: Generates a Stripe Payment Intent for purchasing interview credits.
  - **Request Body**: `{ package_id: string }`
  - **Response Body**: `{ client_secret: string }`
  - **Query Params**: None

- **`POST /api/payments/webhook`**
  - **Description**: Stripe webhook handler for fulfilling credit purchases. (Internal only)
  - **Request Body**: `Stripe.Event`
  - **Response Body**: `200 OK`
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
        "session_id": "rt_session_123",
        "token": "rt_token_abc"
      },
      "whiteboard": {
        "room_id": "wb_room_123",
        "key": "wb_key_abc"
      }
    }
    ```
  - **Behavior Rules**:
    - Route is participant-only (interview participants can provision/join; non-participants are rejected).
    - Provisioning is join-time runtime behavior and does not introduce a separate persisted interview `status`.
    - Retries/reconnects for the same active interview are idempotent and must reuse existing persisted values when present.
    - `peer_to_peer`: both participants receive credentials for the same shared room/key pair.
    - `ai_led`: return a single-user room/key pair scoped to the interview.
    - Credentials returned here are not exposed through `GET /api/interviews`; use this route at join-time.
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
  - **Description**: Retrieves the full interview detail payload for a participant, including all secret/detail-only fields.
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
        "realtime_session_id": "rt_session_123",
        "excalidraw_room_id": "wb_room_123",
        "excalidraw_key": "wb_key_abc",
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
  - **Description**: Submits a new availability request with multiple time slots.
  - **Request Body**: `{ interview_type: 'system_design' | 'coding' | 'behavioral', max_matches: number, slots: Array<{ start_time: string, end_time: string }> }`
  - **Response Body**: `{ request: Availability_Request, slots: Availability_Slot[] }`
  - **Validation Rules**:
    - Each slot must be exactly 60 minutes (`end_time = start_time + 60m`).
    - `start_time < end_time`.

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
