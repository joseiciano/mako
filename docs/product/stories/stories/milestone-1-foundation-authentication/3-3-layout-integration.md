# Story 3.3: Layout Integration & Auth Guards (Layout 3-3)

**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Integrate the App Shell into the main routing system and enforce authentication guards.
**Status**: Todo
**Prerequisite**: [Story 3.2: Mobile Responsive Navigation](./3-2-mobile-nav.md)

## Implementation Plan

### 1. Routing Integration
- [ ] **Refactor Root Route for Layout Injection**
    - [ ] Update `apps/frontend/src/routes/__root.tsx`:
        - [ ] Define logic to determine if the current route is "Authenticated" or "Public".
        - [ ] Wrap authenticated route children with the `AppShell` component.
        - [ ] Ensure public routes (Landing, Login, Register) are rendered without the shell.

### 2. Authentication Guards
- [ ] **Implement Global Auth Redirects**
    - [ ] In `apps/frontend/src/components/layout/app-shell/app-shell-smart.tsx`:
        - [ ] Integrate **Better Auth** hooks to check for an active session.
        - [ ] Implement a client-side redirect to `/login` if no session is detected and the user is on an authenticated route.
        - [ ] Show a loading state or skeleton while the auth status is being resolved.

### 3. Navigation State Sync
- [ ] **Sync Navigation with Route Changes**
    - [ ] Ensure the mobile drawer automatically closes when a navigation link is clicked.
    - [ ] Verify that navigation links correctly reflect the active route after redirection.

## Files to be Added/Changed
- **Modified Files**:
    - `apps/frontend/src/routes/__root.tsx`
    - `apps/frontend/src/components/layout/app-shell/app-shell-smart.tsx`

## End Goal
The application shell is correctly applied to all authenticated pages. Users are automatically redirected to the login page if they try to access a protected route without a session. The entire layout feels unified and secure.
