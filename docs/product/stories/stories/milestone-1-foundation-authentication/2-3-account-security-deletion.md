# Story: Account Security & Deletion
**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Develop the 'Danger Zone' featuring high-friction account deletion to ensure user privacy and security.
**Status**: Completed

## Implementation Plan

### 1. Secure Deletion API (Backend)
- [x] **Repository & Service Layer**
    - [x] Implement `deleteAccount` in `AccountRepository` (Soft delete: set `deleted_at`).
    - [x] Create logic in `AccountService` to:
        - [x] Invalidate all active sessions via **Better Auth** (`session` table revocation).
        - [x] Trigger any necessary cleanup workflows (cancelling upcoming interviews).

- [x] **Controller Layer**
    - [x] Add `DELETE /api/account` endpoint to `AccountController`.
    - [x] Implement strict authentication checks to ensure only the account owner can trigger deletion.

### 2. The Danger Zone (Frontend)
- [x] **Account Deletion UI**
    - [x] Create `apps/frontend/src/components/settings/danger-zone/` directory.
    - [x] Implement `danger-zone-dumb.tsx`:
        - [x] Visually distinct section at the bottom of the settings page.
        - [x] Warning text explaining that deletion is permanent.
        - [x] "Delete Account" button with high-visibility (red/destructive) styling.

- [x] **Confirmation Flow**
    - [x] Create `apps/frontend/src/components/modals/delete-account-confirmation/` directory.
    - [x] Implement `delete-account-confirmation-smart.tsx`:
        - [x] Handle the mutation and redirect to landing page on success.
    - [x] Implement `delete-account-confirmation-dumb.tsx`:
        - [x] Require the user to type a confirmation string ("DELETE") to enable the button.

## Files to be Added/Changed
- **New Files**:
    - `packages/shared-backend/src/account/types.ts`
    - `packages/shared-backend/src/account/account-service.ts`
    - `packages/shared-backend/src/account/index.ts`
    - `apps/frontend/src/components/settings/danger-zone/danger-zone-dumb.tsx`
    - `apps/frontend/src/components/settings/danger-zone/danger-zone-smart.tsx`
    - `apps/frontend/src/components/settings/danger-zone/index.tsx`
    - `apps/frontend/src/components/modals/delete-account-confirmation/delete-account-confirmation-smart.tsx`
    - `apps/frontend/src/components/modals/delete-account-confirmation/delete-account-confirmation-dumb.tsx`
    - `apps/frontend/src/components/modals/delete-account-confirmation/index.tsx`
    - `apps/frontend/src/routes/settings/profile/index.tsx`
    - `apps/frontend/src/routes/settings/profile/profile-smart.tsx`
    - `apps/frontend/src/hooks/use-account.ts`
    - backend/frontend Vitest config + tests
- **Modified Files**:
    - `packages/shared-backend/src/account/account-repository.ts`
    - `packages/shared-backend/src/account/account-controller.ts`
    - `packages/shared/src/index.ts`
    - `apps/backend-rest/src/index.ts`
    - `apps/frontend/src/routes/settings/profile/profile-dumb.tsx` (to integrate the Danger Zone)

## End Goal
A secure, high-friction account deletion process that allows users to exercise their right to be forgotten while preventing accidental data loss through multi-step confirmation.
