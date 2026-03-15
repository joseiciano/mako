The system supports multiple interview "tiers" with a hierarchical credit cost structure:

- **Premium Tier**: Verified professional interviewer. Highest credit cost.
- **Standard Tier (Availability Matching)**: Peer-to-peer matching between users.
    - **Logic**: Users provide availability in 60-minute "slots."
    - **Quotas**: Users can specify a maximum number of interviews (`max_matches`) they want to be matched for within a set of slots.
    - **Double-Blind**: Matching is performed by a background "Greedy Matcher" worker that finds overlapping slots and automatically creates sessions.
    - **Credits**: Mid-range credit cost. Users receive a limited number of **free Standard sessions** upon account creation.
- **AI-Led Tier**: Session led by AI. **Lowest credit cost**. Users receive a limited number of **free AI sessions** upon account creation.
