To ensure system reliability, especially regarding financial transactions and interview scheduling, the following strategies are implemented:

- **Credit Updates**: All balance updates are performed using atomic SQL operations (e.g., `UPDATE users SET credits = credits + ?`) within a database transaction. This prevents race conditions where multiple concurrent updates could lead to incorrect balances.
- **Idempotency**: Stripe webhook handlers utilize the `stripe_payment_intent_id` as an idempotency key. Before granting credits, the system checks the `Credit_Transactions` table to ensure the specific payment hasn't already been fulfilled.
- **Greedy Matcher (Concurrency)**: To prevent over-matching, the "Greedy Matcher" cron worker uses a single Postgres transaction with `SELECT ... FOR UPDATE` to lock candidate `Availability_Slots` and their parent `Availability_Requests`.
- **Quota Enforcement**: Within the matching transaction, the system checks `current_matches < max_matches`. If a match is made, `current_matches` is incremented. If the limit is reached, all other slots for that request are immediately cancelled to prevent redundant matching.
- **Scheduling Locks**: For manual peer-to-peer matching (Premium), the system employs a "First-to-Claim" strategy using Postgres advisory locks to prevent multiple interviewers from accepting the same session.
