# Story: Account Security & Deletion
**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Develop the 'Danger Zone' featuring high-friction account deletion to ensure user privacy and security.
**Status**: Todo

## Implementation Plan

### 1. Secure Deletion API (Backend)
- [ ] **Repository & Service Layer**
    - [ ] Implement `deleteAccount` in `AccountRepository` (Soft delete: set `deleted_at`).
    - [ ] Create logic in `AccountService` to:
        - [ ] Invalidate all active sessions via **Better Auth**.
        - [ ] Trigger any necessary cleanup workflows (e.g., cancelling upcoming interviews).

- [ ] **Controller Layer**
    - [ ] Add `DELETE /api/account` endpoint to `AccountController`.
    - [ ] Implement strict authentication checks to ensure only the account owner can trigger deletion.

### 2. The Danger Zone (Frontend)
- [ ] **Account Deletion UI**
    - [ ] Create `apps/frontend/src/components/settings/danger-zone/` directory.
    - [ ] Implement `danger-zone-dumb.tsx`:
        - [ ] Visually distinct section at the bottom of the settings page.
        - [ ] Warning text explaining that deletion is permanent.
        - [ ] "Delete Account" button with high-visibility (red/destructive) styling.

- [ ] **Confirmation Flow**
    - [ ] Create `apps/frontend/src/components/modals/delete-account-confirmation/` directory.
    - [ ] Implement `delete-account-confirmation-smart.tsx`:
        - [ ] Handle the mutation and redirect to landing page on success.
    - [ ] Implement `delete-account-confirmation-dumb.tsx`:
        - [ ] Require the user to type a confirmation string (e.g., "DELETE") to enable the button.

## Files to be Added/Changed
- **New Files**:
    - `apps/frontend/src/components/settings/danger-zone/danger-zone-dumb.tsx`
    - `apps/frontend/src/components/modals/delete-account-confirmation/delete-account-confirmation-smart.tsx`
    - `apps/frontend/src/components/modals/delete-account-confirmation/delete-account-confirmation-dumb.tsx`
- **Modified Files**:
    - `packages/shared-backend/src/account/account-repository.ts`
    - `packages/shared-backend/src/account/account-controller.ts`
    - `apps/frontend/src/routes/settings/profile/profile-dumb.tsx` (to integrate the Danger Zone)

## End Goal
A secure, high-friction account deletion process that allows users to exercise their right to be forgotten while preventing accidental data loss through multi-step confirmation.
