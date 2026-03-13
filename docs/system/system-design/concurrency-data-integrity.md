To ensure system reliability, especially regarding financial transactions and interview scheduling, the following strategies are implemented:

- **Credit Updates**: All balance updates are performed using atomic SQL operations (e.g., `UPDATE users SET credits = credits + ?`) within a database transaction. This prevents race conditions where multiple concurrent updates could lead to incorrect balances.
- **Idempotency**: Stripe webhook handlers utilize the `stripe_payment_intent_id` as an idempotency key. Before granting credits, the system checks the `Credit_Transactions` table to ensure the specific payment hasn't already been fulfilled.
- **Scheduling Locks**: For peer-to-peer matching, the system employs a "First-to-Claim" strategy using Postgres `SELECT ... FOR UPDATE` or advisory locks to prevent multiple interviewers from accepting the same session.
