# Story 3.3: Layout Integration & Auth Guards (Layout 3-3)

**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Integrate the App Shell into the main routing system and enforce authentication guards.
**Status**: In-Review
**Prerequisite**: [Story 3.2: Mobile Responsive Navigation](./3-2-mobile-nav.md)

## Implementation Plan

### 1. Routing Integration
- [x] **Refactor Route Tree for Layout Injection**
    - [x] Added an authenticated pathless layout route (`/_authenticated`) that wraps protected children with `AppShell`.
    - [x] Added public routes (`/`, `/login`, `/register`) that render outside the shell.
    - [x] Added protected routes (`/dashboard`, `/interviews`, `/billing`, `/settings`) mounted under the authenticated layout.

### 2. Authentication Guards
- [x] **Implement Global Auth Redirects**
    - [x] In `apps/frontend/src/components/layout/app-shell/app-shell-smart.tsx`:
        - [x] Integrated **Better Auth** session hooks via `useAuth` (`authClient.useSession`).
        - [x] Implemented a client-side redirect to `/login` when no session is detected.
        - [x] Added a loading state while auth status is being resolved.
    - [x] Added TanStack authenticated route guard in `apps/frontend/src/routes/_authenticated.tsx` using `beforeLoad` + redirect.

### 3. Navigation State Sync
- [x] **Sync Navigation with Route Changes**
    - [x] Navigation active states now stay in sync with pathname updates and redirects.
    - [x] Header/navigation context now renders only inside authenticated routes.

## Files to be Added/Changed
- **New Files**:
    - `apps/frontend/src/lib/auth-client.ts`
    - `apps/frontend/src/hooks/use-auth.ts`
    - `apps/frontend/src/components/layout/app-shell/app-shell-smart.test.ts`
    - `apps/frontend/src/routes/_authenticated.tsx`
    - `apps/frontend/src/routes/_authenticated.dashboard.tsx`
    - `apps/frontend/src/routes/_authenticated.interviews.tsx`
    - `apps/frontend/src/routes/_authenticated.billing.tsx`
    - `apps/frontend/src/routes/_authenticated.settings.tsx`
    - `apps/frontend/src/routes/_authenticated.settings.profile.tsx`
    - `apps/frontend/src/routes/login.tsx`
    - `apps/frontend/src/routes/register.tsx`
- **Modified Files**:
    - `apps/frontend/src/routes/__root.tsx`
    - `apps/frontend/src/components/layout/app-shell/app-shell-dumb.tsx`
    - `apps/frontend/src/components/layout/app-shell/app-shell-smart.tsx`
    - `apps/frontend/src/routes/index.tsx`
    - `apps/frontend/src/workspace-smoke.test.ts`

## End Goal
The application shell is correctly applied to all authenticated pages. Users are automatically redirected to the login page if they try to access a protected route without a session. The entire layout feels unified and secure.
