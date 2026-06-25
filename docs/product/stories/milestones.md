# Project Milestones

This document outlines the high-level milestones for the Mako platform, breaking down the system design into actionable phases for development and ticket creation.

## Milestone 1: Foundation & Authentication
**Objective**: Establish the core infrastructure, database schema, and user identity management.

- **Infrastructure 1.1: Monorepo & App Scaffolding**: Initialize the monorepo structure, scaffold Hono/TanStack apps and shared packages.
- **Infrastructure 1.2: Cloud Infrastructure (IaC)**: Provision Cloudflare (R2, Hyperdrive) and Neon Postgres via Terraform.
- **Infrastructure 1.3: Database Migration System**: Implement lightweight SQL migration tool and initial foundation schemas.
- **Infrastructure 1.4: CI/CD & Secrets Management**: Automate quality gates and deployments via GitHub Actions and Terraform.
- **Infrastructure 1.5: Developer Experience (DX)**: Configure local emulation (Wrangler) and root-level dev scripts.
- **Infrastructure 1.6: Local Testing Environment**: Standardize local test tooling, isolated test configuration, and developer test workflows.
- **User Authentication**: Implement Better Auth for sign-up, sign-in, and session management.
- **Account 2-1: User Profile & Quotas**: Build the core profile page with identity details and interview balance.
- **Account 2-2: Professional History Management**: Implement the company history tracking and verification metadata.
- **Account 2-3: Account Security & Deletion**: Develop the 'Danger Zone' with high-friction account deletion.
- **Core Layout**: Develop the application shell, including navigation and responsive layout.

## Milestone 2: Interview Scheduling & Dashboard
**Objective**: Enable users to book, view, and manage their interview sessions.

- **Interview CRUD**: Implement backend logic and API routes for creating, listing, and cancelling interviews.
- **Availability Management**: Build the UI and API for users to set time blocks and matching quotas.
- **Matching Engine (Greedy Matcher)**: Develop the background worker and database logic for automated availability-based matching.
- **Dashboard UI**: Build the central hub for users to see upcoming sessions and quick stats.
- **Scheduling Flow**: Create the multi-step form for selecting interview type, mode (P2P/AI), and timing.
- **Notification Service**: Set up queue-driven notification orchestration (Cloudflare Queues + queue consumer worker) for post-commit confirmations and reminders.

## Milestone 3: The Interview Experience (P2P Core)
**Objective**: Build the real-time environment for peer-to-peer system design interviews.

- **Room Provisioning**: Join-time route behavior to generate/reuse Cloudflare Realtime session tokens and Excalidraw room IDs/keys.
- **Real-time Communication**: Integrate audio/video streaming for participants.
- **Collaborative Whiteboard**: Embed and sync the Excalidraw canvas for live sessions.
- **Session Lifecycle**: Implement "Join", "Start", "Timer", and "End Session" functionality with state persistence; timer/start/end orchestration remains separate from whiteboard provisioning.

## Milestone 4: AI Interviewer Implementation
**Objective**: Launch the AI-led interview mode where an LLM acts as the interviewer.

- **AI Prompt Engineering**: Develop the system prompts for different interview types (System Design focus).
- **Real-time AI Interaction**: Integrate with AI Gateway to facilitate low-latency turns between user and AI.
- **Voice Integration**: Implement STT (Speech-to-Text) and TTS (Text-to-Speech) for a seamless conversational experience.
- **Immediate Mode**: Enable "Start Now" functionality specifically for AI sessions.

## Milestone 5: Post-Interview Feedback & AI Analysis
**Objective**: Provide users with automated, high-quality feedback after their sessions.

- **Transcription Pipeline**: Process session recordings using Cloudflare AI (Whisper) to generate transcripts.
- **AI Feedback Engine**: Analyze transcripts and whiteboard snapshots via high-reasoning LLMs; post-interview whiteboard artifact processing belongs here, not live whiteboard scope.
- **Feedback Report UI**: Design and build the post-interview summary page with scores and insights.
- **Asset Storage**: Manage R2 storage for session recordings and whiteboard captures, including persisted screenshot artifacts.

## Milestone 6: Monetization & Credit System
**Objective**: Implement the platform's economic model and payment processing.

- **Credit System**: Backend logic for managing user balances and transaction history.
- **Stripe Integration**: Implement the "Purchase Credits" flow with Stripe Checkout/Payment Intents.
- **Free Tier Logic**: Enforcement of initial free standard and AI interview quotas.
- **Billing Dashboard Sequence**: Authenticated billing route shell, balance summary, credit package purchase, Stripe Elements checkout, and transaction history.

## Milestone 7: Interviewer Verification & Premium Matching
**Objective**: Enable the "Premium" tier with verified professional interviewers.

- **Interviewer Application**: Build the onboarding flow for users to apply as verified interviewers.
- **Admin Review**: Internal tools or status management for approving/rejecting applications.
- **Premium Scheduling**: Logic to match schedulers with verified premium interviewers.
- **Employment Verification**: Integration of company history and verification metadata.

---

## Milestone Summary: Deliverables & Demos

| Milestone | Tangible Result / Demo |
| :--- | :--- |
| **1. Foundation** | A functional web application with secure login/signup and a basic user profile page. |
| **2. Scheduling** | A user dashboard where mock interviews can be scheduled, listed, and managed. |
| **3. P2P Experience** | A live, real-time interview room where two users can interact via audio/video and a shared whiteboard. |
| **4. AI Interviewer** | A functional "Immediate AI" session where a user can practice interviewing against a conversational LLM. |
| **5. AI Feedback** | A comprehensive post-interview report featuring transcripts, performance scores, and technical insights. |
| **6. Monetization** | A fully integrated credit system with Stripe checkout and automated quota management. |
| **7. Premium** | A verified interviewer marketplace where users can book sessions specifically with industry professionals. |
