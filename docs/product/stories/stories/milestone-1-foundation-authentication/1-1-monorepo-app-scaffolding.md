# Story 1.1: Monorepo & App Scaffolding

**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Initialize the monorepo structure and scaffold the core applications and shared packages.
**Status**: Completed

## What Needs to Be Done

### 1. Workspace Configuration
- [x] Finalize `pnpm-workspace.yaml` to manage `apps/` and `packages/`.
- [x] Configure root `package.json` with workspace-wide scripts and dependencies.

### 2. Shared Packages Initialization
- [x] Set up `packages/shared`: Common types and utilities used by both frontend and backend.
- [x] Set up `packages/shared-backend`: Backend-specific shared logic (SQL schemas, database connection utilities, middleware).
- [x] Set up `packages/shared-frontend`: Frontend-specific components and hooks.

### 3. Application Scaffolding
- [x] Initialize `apps/backend-rest` using **Hono** and Cloudflare Workers templates.
- [x] Initialize `apps/frontend` using **TanStack Start** and configure for Cloudflare Workers hosting.

## End Goal
A functional monorepo structure where the frontend and backend apps are scaffolded and can successfully import from the shared packages.
