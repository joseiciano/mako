### Users

The user schema extends the default **Better Auth** requirements to include platform-specific metadata.

- **`id`**: `uuid` (Primary Key) - Unique identifier for the user.
- **`email`**: `text` (Unique) - User's email address.
- **`name`**: `text` - Full name of the user.
- **`credits`**: `integer` (Default: 0) - Current balance of interview credits.
- **`free_standard_interviews`**: `integer` (Default: 1) - Remaining free standard (random) peer interviews.
- **`free_ai_interviews`**: `integer` (Default: 1) - Remaining free AI-led interviews.
- **`companies`**: `string` (Default: false) - Flag indicating if the user is authorized to conduct interviews.
- **`created_at`**: `timestamptz` - Account creation date.
- **`updated_at`**: `timestamptz` - Last profile update.
- **`deleted_at`**: `timestamptz`

### User_Companies

This schema is to store company information. This allows them to be filtered based on company if needed

- **`id`**: `uuid` (Primary Key)
- **`user_id`**: `uuid` (foreign key to `users.id`)
- **`company`**: `string` (lowercase) - name of company 
- **`joined`**: `timestamptz` - time joined company 
- **`created_at`**: `timestamptz`
- **`updated_at`**: `timestamptz`
- **`deleted_at`**: `timestamptz`

ON CASCADE DELETE

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
- **`tier`**: `enum` ('standard', 'premium') - 'premium' requires a verified interviewer; 'standard' is open to any user for random matching.
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

### Credit_Transactions

Logs for financial history and credit fulfillment via Stripe.

- **`id`**: `uuid` (Primary Key)
- **`user_id`**: `uuid` (Foreign Key -> `users.id`)
- **`stripe_payment_intent_id`**: `text` (Unique) - Reference for the Stripe transaction.
- **`amount`**: `integer` - Amount paid in cents.
- **`credits_granted`**: `integer` - Number of credits added to the user's balance.
- **`status`**: `text` - Transaction status (e.g., 'succeeded', 'pending').
- **`created_at`**: `timestamptz`
