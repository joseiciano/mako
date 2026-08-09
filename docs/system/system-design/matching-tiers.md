The system supports three scheduling channels, with account-level quota/credit policies controlling usage:

- **Standard (Availability Matching)**: Peer-to-peer matching between users.
    - **Logic**: Users provide availability in 60-minute "slots."
    - **Quotas**: Users can specify a maximum number of interviews (`max_matches`) they want to be matched for within a set of slots.
    - **Double-Blind**: Matching is performed by a background "Greedy Matcher" worker that finds overlapping slots and automatically creates sessions.
    - **Creation Path**: Standard peer-to-peer sessions are created by the matcher, not direct `POST /api/interviews` calls.
    - **Deterministic Role Assignment**: For matcher-created sessions, participant roles are assigned by matched request order `(created_at ASC, id ASC)` to keep reruns stable (`scheduler_id` first, `interviewer_id` second).
    - **Distinct-User Eligibility**: Standard matcher pairing requires two distinct request users (no self-match pairing); pairs with the same `user_id` are skipped.

- **AI-Led**: Session led by AI.
    - **Creation Path**: Created directly through `POST /api/interviews`.
    - **Immediate Mode**: `scheduled_at: 'now'` is valid for AI-led immediate sessions.
    - **Policy Matrix**:
        - `free_ai_interviews > 0` accepts direct create and consumes free AI quota.
        - `free_ai_interviews = 0` and `credits > 0` accepts direct create and consumes one credit.
        - `free_ai_interviews = 0` and `credits = 0` rejects direct create.
        - Direct `peer_to_peer` creation and direct `interviewer_id` selection remain unsupported for Milestone 2 create-path behavior.

- **Verified Interviewer (Premium First-to-Claim)**: First-to-claim marketplace of exact 60-minute premium slots published by verified interviewers.
    - **Creation Path**: Verified interviewers publish exact 60-minute slots as free inventory; schedulers browse a public marketplace and atomically claim one slot.
    - **Payment**: Claiming a slot pays exactly one credit; there is no free-Standard quota fallback for premium slot claims.
    - **Channel Discriminator**: `booking_channel = 'verified_interviewer'` is the channel discriminator, while `tier` remains the payment-policy outcome (`'premium'`). `tier` is not a channel value.
    - **Concurrency**: Deterministic user-row locking (`SELECT ... FOR UPDATE` in UUID order) plus Postgres advisory locks serialize conflict-sensitive writes (publish overlap checks and claim contention); claimed slots never reopen.

- **Account Policy (Free vs Subscribed, quotas, credits)**:
    - Policy determines how many interviews an account can run (for example using `free_standard_interviews`, `free_ai_interviews`, and credit balance).
    - Scheduling payloads do not carry a client-selected `tier`; effective tier/policy semantics are resolved server-side from account state.
    - Any `standard` / `premium` labeling is an internal policy outcome and does not introduce separate client-facing scheduling paths in Milestone 2 Interview CRUD. Default policy config maps free AI quota to `standard` and credit-backed AI create to `premium`, but that mapping remains configuration-driven.
    - Limit values are configuration-driven and may be tuned over time without changing route shapes.
