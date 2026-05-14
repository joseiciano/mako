# Story 4.2: Better Auth Frontend Foundation
**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Set up the Better Auth client on the frontend and implement authentication hooks and route guards.
**Status**: Completed

## What Needs to Be Done

### 1. Frontend Auth Client
- [x] Create `packages/shared-frontend/src/auth/auth-client.ts` to initialize the Better Auth client.
- [x] Create `apps/frontend/src/hooks/use-auth.ts` to expose the session and user state via TanStack Query.

### 2. Authentication Guards
- [x] Create `apps/frontend/src/components/auth-guard/index.tsx` as a smart-dumb component.
- [x] Implement `auth-guard-smart.tsx` to handle session checks and redirects to `/login`.
- [x] Implement `auth-guard-dumb.tsx` to render protected content or loading states.
- [x] Integrate the `AuthGuard` into the main application layout for protected routes.

## Implementation Notes
- Protected routes are route-first: `_authenticated.beforeLoad` reads the Better Auth session through TanStack Query using `context.queryClient.fetchQuery(authSessionQueryOptions())` and redirects to `/login` when no active session exists.
- `AuthGuard` remains mounted around `AppShell` as a reactive UI fallback so protected layouts show a loading state while the auth session query resolves or updates after hydration/sign-out.
- `apps/frontend/src/lib/auth-client.ts` delegates app client creation to `createMakoAuthClient` from `@mako/shared-frontend` while preserving `getAuthBaseUrl()` environment-based `baseURL` configuration.
- Auth success/sign-out helpers now accept a `QueryClient` so login, signup, and AppShell sign-out keep the shared `['auth', 'session']` query synchronized.

## End Goal
The frontend is capable of tracking user sessions and automatically redirecting unauthenticated users from protected pages.
