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
  - **Workflow**:
    - **Scheduled Sessions**: After successful commit, triggers confirmation notification orchestration and queues reminder orchestration for 30 minutes prior to `scheduled_at` when applicable.
    - **Immediate AI Sessions**: If `mode: 'ai_led'` and `scheduled_at` is set to `'now'`, the interview is created with immediate timing semantics, but realtime/whiteboard provisioning remains join-time via `POST /api/interviews/:id/provision` (not in create-route transaction scope).
  - **Request Body**: `{ type: 'system_design' | 'coding' | 'behavioral', mode: 'ai_led', scheduled_at: ISO-8601 timestamp string | 'now' }`
  - **Response Body**: `{ interview: Interview }`
  - **Query Params**: None

- **`GET /api/interviews`**
  - **Description**: Lists interviews for the current user.
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
  - **Description**: Provisions a Cloudflare Realtime session for an upcoming interview.
  - **Request Body**: None
  - **Response Body**: `{ session_id: string, token: string }`
  - **Query Params**: None

- **GET /api/interviews/:id**
  - **Description**: Retrieves full details of a specific interview, including feedback and recording URLs if available.
  - **Request Body**: None
  - **Response Body**: `{ interview: Interview }`
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
