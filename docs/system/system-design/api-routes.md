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
  - **Response Body**: `{ user: User, free_standard_remaining: number, free_ai_remaining: number }`
  - **Query Params**: None

- **`PATCH /api/account`**
  - **Description**: Updates user profile information (name).
  - **Request Body**: `{ name?: string }`
  - **Response Body**: `{ user: User }`
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
  - **Description**: Schedules or initializes a new interview session (Peer-to-peer or AI-led).
  - **Workflow**:
    - **Scheduled Sessions**: Triggers an immediate confirmation email and queues a reminder email for 30 minutes prior to the `scheduled_at` time.
    - **Immediate AI Sessions**: If `mode: 'ai_led'` and `scheduled_at` is set to 'now', the session is provisioned immediately, and the user can join right away.
  - **Request Body**: `{ type: 'system_design' | 'coding' | 'behavioral', mode: 'peer_to_peer' | 'ai_led', tier: 'standard' | 'premium', scheduled_at: string | 'now', interviewer_id?: string }`
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

- **`GET /api/interviews/:id`**
  - **Description**: Retrieves full details of a specific interview, including feedback and recording URLs if available.
  - **Request Body**: None
  - **Response Body**: `{ interview: Interview }`
  - **Query Params**: None

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
