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
  - **Field Mapping (API camelCase ↔ DB snake_case)**:
    - `displayName <- users.name`
    - `freeStandardInterviews <- users.free_standard_interviews`
    - `freeAiInterviews <- users.free_ai_interviews`
    - `createdAt <- users.created_at`
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
- **`POST /api/payments/create-intent`**
  - **Description**: Generates a Stripe Payment Intent for purchasing interview credits.
  - **Request Body**: `{ packageId: string }`
  - **Response Body**: `{ clientSecret: string }`
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
    - `tier` is treated as a limit-policy input (account/quota policy), not as a separate create flow.
    - `interviewer_id` is out of scope for this route contract and must not be provided.
  - **Workflow**:
    - **Scheduled Sessions**: Triggers an immediate confirmation email and queues a reminder email for 30 minutes prior to the `scheduled_at` time.
    - **Immediate AI Sessions**: If `mode: 'ai_led'` and `scheduled_at` is set to `'now'`, the session is provisioned immediately, and the user can join right away.
  - **Request Body**: `{ type: 'system_design' | 'coding' | 'behavioral', mode: 'ai_led', tier: 'standard' | 'premium', scheduled_at: string | 'now' }`
  - **Response Body**: `{ interview: Interview }`
  - **Query Params**: None

- **`GET /api/interviews`**
  - **Description**: Lists interviews for the current user.
  - **Request Body**: None
  - **Response Body**: `{ interviews: Interview[] }`
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
  - **Request Body**: `{ interview_type: string, max_matches: number, slots: Array<{ start_time: string, end_time: string }> }`
  - **Response Body**: `{ request: Availability_Request, slots: Availability_Slot[] }`

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
