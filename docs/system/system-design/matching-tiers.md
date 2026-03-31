The system supports two scheduling channels, with account-level quota/credit policies controlling usage:

- **Standard (Availability Matching)**: Peer-to-peer matching between users.
    - **Logic**: Users provide availability in 60-minute "slots."
    - **Quotas**: Users can specify a maximum number of interviews (`max_matches`) they want to be matched for within a set of slots.
    - **Double-Blind**: Matching is performed by a background "Greedy Matcher" worker that finds overlapping slots and automatically creates sessions.
    - **Creation Path**: Standard peer-to-peer sessions are created by the matcher, not direct `POST /api/interviews` calls.
    - **Deterministic Role Assignment**: For matcher-created sessions, participant roles are assigned by matched request order `(created_at ASC, id ASC)` to keep reruns stable (`scheduler_id` first, `interviewer_id` second).

- **AI-Led**: Session led by AI.
    - **Creation Path**: Created directly through `POST /api/interviews`.
    - **Immediate Mode**: `scheduled_at: 'now'` is valid for AI-led immediate sessions.

- **Account Policy (Free vs Subscribed, quotas, credits)**:
    - Policy determines how many interviews an account can run (for example using `free_standard_interviews`, `free_ai_interviews`, and credit balance).
    - Scheduling payloads do not carry a client-selected `tier`; effective tier/policy semantics are resolved server-side from account state.
    - Any `standard` / `premium` labeling is an internal policy outcome and does not introduce separate client-facing scheduling paths in Milestone 2 Interview CRUD.
    - Limit values are configuration-driven and may be tuned over time without changing route shapes.
