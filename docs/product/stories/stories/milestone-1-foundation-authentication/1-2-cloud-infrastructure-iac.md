# Story 1.2: Cloud Infrastructure (IaC)

**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Provision all required Cloudflare and Neon resources using Terraform.
**Status**: Todo

## What Needs to Be Done

### 1. Terraform Initialization
- [ ] Set up the `/infrastructure` directory with Terraform providers for Cloudflare and Neon.
- [ ] Configure remote state management (if applicable).

### 2. Resource Provisioning
- [ ] Provision **Cloudflare Workers** scripts and associated environments/bindings:
    - Main **Backend API Worker** (Hono).
    - **Greedy Matcher Worker** (Cron-triggered).
    - **Interview Provisioner Worker** (Queue-triggered Consumer).
- [ ] Provision **Cloudflare R2** buckets for asset storage (recordings, screenshots).
- [ ] Provision **Cloudflare Queues** for interview provisioning hand-off.
- [ ] Provision **Cloudflare Hyperdrive** instances for optimized database connection pooling.
- [ ] Provision **Neon Postgres** development and production database instances.
- [ ] Configure **Cloudflare AI Gateway**, **Realtime**, and **Workflows** bindings via Terraform.

## End Goal
All cloud infrastructure is defined as code and successfully provisioned, providing the backend and frontend with the necessary storage, database, and AI resources.
