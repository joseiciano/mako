# Story: Availability Matching Engine (Greedy Matcher)

**Milestone**: Milestone 2: Interview Scheduling & Dashboard
**Description**: Background logic to match users based on overlapping availability slots while respecting session quotas.

## Technical Overview

The "Greedy Matcher" is a Cloudflare Worker triggered by a Cron job (every 5-10 minutes) that finds overlapping time slots between users and automatically schedules interviews.

### Matching Algorithm

1.  **Candidate Selection**:
    -   Fetch all `Availability_Slots` where `status = 'available'` and `start_time > NOW()`.
    -   Join with `Availability_Requests` where `current_matches < max_matches` and `status = 'active'`.
2.  **Overlap Logic**:
    -   Find pairs of slots (User A and User B) where `A.start_time = B.start_time` and `A.user_id != B.user_id`.
    -   Sort matches by `created_at` (Oldest first) to ensure fairness.
3.  **Atomic Execution**:
    -   Perform the match inside a Postgres transaction.
    -   Use `SELECT ... FOR UPDATE` to lock the two slots and the two parent requests.
    -   Create a new `Interviews` record.
    -   Increment `current_matches` for both requests.
    -   Mark the matched slots as `status = 'matched'`.
4.  **Quota Fulfillment**:
    -   If a request's `current_matches` reaches its `max_matches`, set the request `status = 'fulfilled'` and mark all other slots for that request as `status = 'cancelled'`.

## Side Effects (Orchestration)

Once a match is successfully persisted in the database, the Matcher Worker should:

1.  **Push to Provisioning Queue**: Send a message to the `interview-provisioning` queue with the IDs of both users and the interview.
2.  **Notification**: The Queue Consumer will trigger:
    -   Cloudflare Realtime session initialization.
    -   Excalidraw room creation.
    -   Confirmation emails via Resend.
    -   Cloudflare Workflow for the 30-minute reminder.

## UI/UX Integration

-   **Dashboard**: Users see a "Matching in Progress..." indicator for active availability requests.
-   **Calendar**: A visual grid where users click-and-drag to create 60-minute slots.
-   **Quota Input**: A simple numeric field for "How many interviews do you want to do today?"
