# Story: User Profile & Quotas
**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Build the core profile page where users can view their identity details and interview balance.
**Status**: Completed

## Implementation Plan

### 1. Profile API Development (Backend)
- [x] **Data Access Layer (Repository)**
    - [x] Create `packages/shared-backend/src/account/account-repository.ts`.
    - [x] Implement `AccountRepository` to fetch user profile data and quotas (`credits`, `free_standard_interviews`, `free_ai_interviews`).
    - [x] Implement `updateProfile` to modify the user's name.

- [x] **Service & Controller Layer**
    - [x] Create `packages/shared-backend/src/account/types.ts` for profile update validation.
    - [x] Implement `AccountService` to handle session validation and business rules for profile updates.
    - [x] Implement `AccountController` with `GET /api/account` and `PATCH /api/account` endpoints.
    - [x] Register the controller in the main Hono app.

### 2. User Settings Interface (Frontend)
- [x] **Data Sync (Hooks)**
    - [x] Create `apps/frontend/src/hooks/use-account.ts`.
    - [x] Implement `useAccount` query hook and `useUpdateProfile` mutation hook using **TanStack Query**.

- [x] **Profile Page UI**
    - [x] Create `apps/frontend/src/routes/settings/profile/` directory.
    - [x] Implement `profile-smart.tsx` to orchestrate data fetching and form submission.
    - [x] Implement `profile-dumb.tsx` using **Tailwind CSS**:
        - [x] Header with user's current avatar/name.
        - [x] Editable form for "Display Name".
        - [x] Read-only section for account metadata (Email, Join Date).
        - [x] Interactive "Quotas & Credits" card showing remaining free sessions and credit balance.

## Files to be Added/Changed
- **New Files**:
    - `packages/shared-backend/src/account/account-repository.ts`
    - `packages/shared-backend/src/account/account-service.ts`
    - `packages/shared-backend/src/account/account-controller.ts`
    - `packages/shared-backend/src/account/types.ts`
    - `packages/shared-backend/src/account/index.ts`
    - `apps/frontend/src/routes/settings/profile/index.tsx`
    - `apps/frontend/src/routes/settings/profile/profile-smart.tsx`
    - `apps/frontend/src/routes/settings/profile/profile-dumb.tsx`
    - `apps/frontend/src/hooks/use-account.ts`
- **Modified Files**:
    - `apps/backend-rest/src/index.ts`

## End Goal
A functional settings page where users can update their account/profile settings and see their current quotas/credits (not implemented until later ticket)

## Notes
- Added unit tests for backend account service/controller and frontend account hooks.
- Session resolution currently supports `x-user-id` / `x-user-email` request headers with a seeded demo fallback until Better Auth is integrated in Story 4.x.
