# Mako System Architecture

This diagram illustrates the high-level architecture of the Mako SWE interview platform, highlighting the integration of Cloudflare services, AI components, and the frontend/backend stack.

```mermaid
graph TD
    subgraph "Client Layer"
        User["User (Browser)"]
        FE_Stack["Frontend (TanStack Start)
        - Tailwind CSS
        - Lucide Icons
        - TanStack Query
        - Zod (Validation)
        - RealtimeKit SDK"]
    end

    subgraph "Hosting & Edge Layer (Cloudflare Workers)"
        FE_Worker["Frontend Worker
        (TanStack Start)"]
        BE_Worker["Backend API Worker
        (Hono Framework)"]
    end

    subgraph "Services & Orchestration"
        Auth["Better Auth
        (Authentication)"]
        Realtime["Cloudflare Realtime
        (Web Streaming / Mocks)"]
        Workflows["Cloudflare Workflows
        (Interview Lifecycle / Timers)"]
        AIGateway["Cloudflare AI Gateway
        (Mock Feedback / AI Interviewer)"]
        Stripe["Stripe
        (Payments / Credits)"]
    end

    subgraph "Data & Storage Layer"
        Hyperdrive["Cloudflare Hyperdrive
        (DB Connection Pooling)"]
        DB["Neon Postgres
        (Data Collection)"]
        R2["Cloudflare R2
        (Recordings & Screenshots)"]
    end

    %% Relationships
    User <--> FE_Stack
    FE_Stack <--> FE_Worker
    FE_Worker <--> BE_Worker
    
    %% Realtime Connections
    FE_Stack -- "WebRTC / Signaling" <--> Realtime
    BE_Worker -- "REST API (Provisioning)" --> Realtime
    
    %% Orchestration & Payments
    BE_Worker -- "Trigger Interview" --> Workflows
    BE_Worker -- "Checkout / Webhooks" <--> Stripe
    Stripe -- "Fulfill Credits" --> BE_Worker
    Workflows -- "Warnings / Lock" --> Realtime
    Workflows -- "Gen Feedback" --> AIGateway
    Workflows -- "Save Result" --> Hyperdrive
    
    %% Auth & Data Connections
    BE_Worker <--> Auth
    Auth -- "User Data / Sessions" --> Hyperdrive
    BE_Worker <--> AIGateway
    
    BE_Worker -- "Update Credits/Data" --> Hyperdrive
    Hyperdrive <--> DB
    BE_Worker <--> R2

    %% AI Integration
    AIGateway <--> AIProviders["AI Providers
    (LLMs for Mock Feedback)"]

    %% Styling
    classDef cloudflare fill:#f38020,stroke:#333,stroke-width:2px,color:#fff;
    classDef database fill:#00e599,stroke:#333,stroke-width:2px,color:#000;
    classDef frontend fill:#2563eb,stroke:#333,stroke-width:2px,color:#fff;
    
    class FE_Worker,BE_Worker,Realtime,AIGateway,Hyperdrive,R2,Workflows cloudflare;
    class DB database;
    class FE_Stack frontend;
```

## Key Components

- **Frontend:** Built with TanStack Start, hosted on Cloudflare Workers for edge performance.
- **Backend API:** Uses Hono for routing within Cloudflare Workers, ensuring low latency.
- **Database:** Postgres hosted on Neon, optimized for serverless environments with Cloudflare Hyperdrive.
- **AI Integration:** Cloudflare AI Gateway manages requests to AI providers for real-time interview feedback and the AI interviewer functionality.
- **Real-time:** Cloudflare Realtime handles the live streaming required for mock interviews between users.
- **Storage:** Cloudflare R2 stores session recordings and any captured screenshots for review.
