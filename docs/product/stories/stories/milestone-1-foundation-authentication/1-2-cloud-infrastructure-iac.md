# Story 1.2: Cloud Infrastructure (IaC)

**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Provision all required Cloudflare and Neon resources using Terraform.
**Status**: Completed
**Last reconciled**: 2026-03-30 (Documentation Drift Resolution Plan)

## What Needs to Be Done

### 1. Terraform Initialization
- [x] Set up the `/infrastructure` directory with Terraform providers for Cloudflare and Neon.
- [x] Configure remote state management (if applicable).

### 2. Resource Provisioning
- [x] Provision **Cloudflare Workers** scripts and associated environments/bindings:
    - Main **Backend API Worker** (Hono).
    - **Greedy Matcher Worker** (Cron-triggered).
    - **Notification Orchestration Worker** (Queue-triggered consumer for post-commit lifecycle events).
- [x] Provision **Cloudflare R2** buckets for asset storage (recordings, screenshots).
- [x] Provision **Cloudflare Queues** for post-commit lifecycle event hand-off (e.g., create/cancel/match notifications and reminders).
- [x] Provision **Cloudflare Hyperdrive** instances for optimized database connection pooling.
- [x] Provision **Neon Postgres** development and production database instances.
- [x] Configure **Cloudflare AI Gateway**, **Realtime**, and **Workflows** bindings via Terraform.

### 3. Runtime boundary clarification
- [x] Keep realtime session provisioning as join-time API behavior (`POST /api/interviews/:id/provision`), not queue-triggered provisioning.

## End Goal
All cloud infrastructure is defined as code and successfully provisioned, providing the backend and frontend with the necessary storage, database, and AI resources.
