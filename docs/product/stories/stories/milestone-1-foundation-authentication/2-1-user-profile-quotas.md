# Story: User Profile & Quotas
**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Build the core profile page where users can view their identity details and interview balance.
**Status**: Todo

## Implementation Plan

### 1. Profile API Development (Backend)
- [ ] **Data Access Layer (Repository)**
    - [ ] Create `packages/shared-backend/src/account/account-repository.ts`.
    - [ ] Implement `AccountRepository` to fetch user profile data and quotas (`credits`, `free_standard_interviews`, `free_ai_interviews`).
    - [ ] Implement `updateProfile` to modify the user's name.

- [ ] **Service & Controller Layer**
    - [ ] Create `packages/shared-backend/src/account/types.ts` for profile update validation.
    - [ ] Implement `AccountService` to handle session validation and business rules for profile updates.
    - [ ] Implement `AccountController` with `GET /api/account` and `PATCH /api/account` endpoints.
    - [ ] Register the controller in the main Hono app.

### 2. User Settings Interface (Frontend)
- [ ] **Data Sync (Hooks)**
    - [ ] Create `apps/frontend/src/hooks/use-account.ts`.
    - [ ] Implement `useAccount` query hook and `useUpdateProfile` mutation hook using **TanStack Query**.

- [ ] **Profile Page UI**
    - [ ] Create `apps/frontend/src/routes/settings/profile/` directory.
    - [ ] Implement `profile-smart.tsx` to orchestrate data fetching and form submission.
    - [ ] Implement `profile-dumb.tsx` using **Tailwind CSS**:
        - [ ] Header with user's current avatar/name.
        - [ ] Editable form for "Display Name".
        - [ ] Read-only section for account metadata (Email, Join Date).
        - [ ] Interactive "Quotas & Credits" card showing remaining free sessions and credit balance.

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
