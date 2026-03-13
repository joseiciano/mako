The platform manages complex interview states across the frontend and backend:

- **Frontend State**: Managed via **TanStack Store** for global UI state and **TanStack Query** for server-state synchronization.
- **Interview Lifecycle**:
    - **Scheduled (Peer-to-Peer or AI)**: The session exists in Postgres. 
        - **Notifications**: Email notifications are sent upon creation and 30 minutes before the start time.
        - **Frontend**: Users revisit or navigate to the interview page. When the scheduled time is reached, the UI displays a "Join" button.
    - **Immediate (AI-Led Only)**: The session is provisioned upon creation.
        - **Frontend**: The "Join" button is visible immediately after scheduling.
    - **Provisioning**: Triggered by the "Join" button. For scheduled sessions, this occurs at the start time; for immediate AI sessions, this occurs instantly upon clicking "Join".
    - **Ongoing**: Live audio, video, and whiteboard state updates are synchronized via Cloudflare Realtime. Both participants join the shared whiteboard session using the provisioned credentials.
    - **Completion**: Triggered by a timer (Cloudflare Workflow) or manual end. The session is locked, and state is updated to `completed`.
