# Story 4.1: Better Auth Backend & Database Setup
**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Initialize Better Auth on the backend with Postgres and configure the core authentication handler.
**Status**: Todo

## What Needs to Be Done

### 1. Database Schema for Authentication
- [ ] Create a migration file to set up Better Auth tables (`user`, `session`, `account`, `verification`) in Postgres.
- [ ] Ensure the `user` table includes platform-specific fields: `credits`, `free_standard_interviews`, `free_ai_interviews`.

Note: For the database schema for authentication, reference email/password authentication from the [Better Auth Docs](https://better-auth.com/docs/basic-usage#email--password)

### 2. Backend Authentication Core
- [ ] Create `packages/shared-backend/src/auth/auth-config.ts` to initialize Better Auth with the `pg` adapter.
- [ ] Implement `packages/shared-backend/src/auth/auth-controller.ts` to mount the Better Auth handler on `/api/auth/*`.
- [ ] Create `packages/shared-backend/src/auth/auth-middleware.ts` for Hono session validation.
- [ ] Register the `authController` in `apps/backend-rest/src/index.ts`.

## End Goal
A functional authentication backend that can handle session management and interact with the Postgres database for user data storage.
