## Migration Workflow

All schema changes must be created as versioned raw SQL migrations in:

- `packages/shared-backend/migrations/*.sql`

Use the migration scripts to keep a consistent workflow:

1. Create a migration file:

```bash
pnpm db:migration:create -- <migration_name>
```

2. Apply pending migrations to a Postgres instance:

```bash
DATABASE_URL=<postgres_connection_string> pnpm db:migrate
```

Migrations are tracked in the `schema_migrations` table.

### Users

The user schema extends the default **Better Auth** requirements to include platform-specific metadata.

- **`id`**: `uuid` (Primary Key) - Unique identifier for the user.
- **`email`**: `text` (Unique) - User's email address.
- **`name`**: `text` - Full name of the user.
- **`credits`**: `integer` (Default: 0) - Current balance of interview credits.
- **`free_standard_interviews`**: `integer` (Default: 1) - Remaining free standard (random) peer interviews.
- **`free_ai_interviews`**: `integer` (Default: 1) - Remaining free AI-led interviews.
- **`companies`**: `boolean` (Default: false) - Flag indicating if the user is authorized to conduct interviews.
- **`created_at`**: `timestamptz` - Account creation date.
- **`updated_at`**: `timestamptz` - Last profile update.
- **`deleted_at`**: `timestamptz`

Constraints:

- `email` is unique.
- `credits >= 0`
- `free_standard_interviews >= 0`
- `free_ai_interviews >= 0`

### User_Companies

This schema is to store company information. This allows them to be filtered based on company if needed

- **`id`**: `uuid` (Primary Key)
- **`user_id`**: `uuid` (Foreign Key -> `users.id`, On Delete Cascade)
- **`company`**: `string` (lowercase) - name of company
- **`joined`**: `timestamptz` - time joined company
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`
- **`deleted_at`**: `timestamptz`

Constraints:

- `company = lower(company)`

Indexes:

- `idx_user_companies_user_id` on (`user_id`)

### User_Interviewer_Applications

Used to track the verification flow for users wanting to become interviewers.

- **`id`**: `uuid` (Primary Key)
- **`user_id`**: `uuid` (Foreign Key -> `users.id`) - The applicant.
- **`email`**: `text` - Contact email for the application.
- **`employment_history`**: `jsonb` - Structured history of previous roles and companies.
- **`status`**: `enum` ('pending', 'approved', 'rejected') - Current state of the application.
- **`reviewed_by`**: `uuid` (Optional, Foreign Key -> `users.id`) - Admin who reviewed the application.
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

### Interviews

Core entity for tracking mock sessions and AI-led interviews.

- **`id`**: `uuid` (Primary Key)
- **`scheduler_id`**: `uuid` (Foreign Key -> `users.id`) - The user who booked the interview.
- **`scheduler_alias`**: `text` - Anonymous name for the scheduler during the session.
- **`interviewer_id`**: `uuid` (Optional, Foreign Key -> `users.id`) - The assigned interviewer (null if AI-led).
- **`interviewer_alias`**: `text` - Anonymous name for the interviewer during the session.
- **`type`**: `enum` ('system_design', 'coding', 'behavioral') - Category of the interview.
- **`mode`**: `enum` ('peer_to_peer', 'ai_led') - Whether it's a mock with another user or AI.
- **`tier`**: `enum` ('standard', 'premium') - In Milestone 2, this is a policy label/input (quota/limits), not a separate creation flow. Verified-interviewer assignment behavior is future milestone scope.
- **`status`**: `enum` ('scheduled', 'ongoing', 'completed', 'cancelled')
- **`scheduled_at`**: `timestamptz` - Time the interview is set to start.
- **`realtime_session_id`**: `text` (Optional) - Cloudflare Realtime session identifier.
- **`excalidraw_room_id`**: `text` (Optional) - Unique ID for the collaborative whiteboard session.
- **`excalidraw_key`**: `text` (Optional) - Encryption key for the whiteboard data.
- **`recording_url`**: `text` (Optional) - URL for the session recording in R2.
- **`screenshot_urls`**: `jsonb` (Optional) - Array of URLs for whiteboard captures or session screenshots stored in R2.
- **`feedback`**: `jsonb` (Optional) - Stores AI-generated feedback, scores, and improvement areas.
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

### Availability_Requests

Groups a set of time blocks where a user is available for matching, with a maximum quota.

- **`id`**: `uuid` (Primary Key)
- **`user_id`**: `uuid` (Foreign Key -> `users.id`, On Delete Cascade)
- **`max_matches`**: `integer` - Maximum number of interviews the user wants for this request.
- **`current_matches`**: `integer` (Default: 0) - Number of matches already made for this request.
- **`interview_type`**: `text` with CHECK (`system_design`, `coding`, `behavioral`)
- **`status`**: `text` with CHECK (`active`, `fulfilled`, `cancelled`)
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

Constraints:

- `max_matches > 0`
- `current_matches >= 0`

Indexes:

- `idx_availability_requests_user_id_status` on (`user_id`, `status`)

### Availability_Slots

Individual 60-minute time blocks associated with an Availability Request.

- **`id`**: `uuid` (Primary Key)
- **`request_id`**: `uuid` (Foreign Key -> `availability_requests.id`, On Delete Cascade)
- **`start_time`**: `timestamptz` - The start of the 60-minute window.
- **`end_time`**: `timestamptz` - The end of the 60-minute window.
- **`status`**: `text` with CHECK (`available`, `matched`, `cancelled`)
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`

Constraints:

- `availability_slots_time_window_check`: `start_time < end_time`
- `availability_slots_unique_window`: unique (`request_id`, `start_time`, `end_time`)

Indexes:

- `idx_availability_slots_request_id_status` on (`request_id`, `status`)

### Credit_Transactions

Logs for financial history and credit fulfillment via Stripe.

- **`id`**: `uuid` (Primary Key)
- **`user_id`**: `uuid` (Foreign Key -> `users.id`)
- **`stripe_payment_intent_id`**: `text` (Unique) - Reference for the Stripe transaction.
- **`amount`**: `integer` - Amount paid in cents.
- **`credits_granted`**: `integer` - Number of credits added to the user's balance.
- **`status`**: `text` - Transaction status (e.g., 'succeeded', 'pending').
- **`created_at`**: `timestamptz`
