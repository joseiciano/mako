# Story 4.2: Better Auth Frontend Foundation
**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Set up the Better Auth client on the frontend and implement authentication hooks and route guards.
**Status**: Todo

## What Needs to Be Done

### 1. Frontend Auth Client
- [ ] Create `packages/shared-frontend/src/auth/auth-client.ts` to initialize the Better Auth client.
- [ ] Create `apps/frontend/src/hooks/use-auth.ts` to expose the session and user state via TanStack Query.

### 2. Authentication Guards
- [ ] Create `apps/frontend/src/components/auth-guard/index.tsx` as a smart-dumb component.
- [ ] Implement `auth-guard-smart.tsx` to handle session checks and redirects to `/login`.
- [ ] Implement `auth-guard-dumb.tsx` to render protected content or loading states.
- [ ] Integrate the `AuthGuard` into the main application layout for protected routes.

## End Goal
The frontend is capable of tracking user sessions and automatically redirecting unauthenticated users from protected pages.
