# Story: Professional History Management
**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Implement company history tracking to enable future interviewer verification and personalized matching.
**Status**: Todo

## Implementation Plan

### 1. Company History API (Backend)
- [ ] **Repository Layer**
    - [ ] Extend `AccountRepository` (or create `CompanyRepository`) to interact with the `User_Companies` table.
    - [ ] Implement `getCompaniesByUserId` and `addCompanyRecord`.

- [ ] **API Logic**
    - [ ] Define Zod schemas in `packages/shared-backend/src/account/types.ts` for company records (name, join date).
    - [ ] Add `GET /api/companies` and `POST /api/companies` to the `AccountController`.
    - [ ] Ensure proper validation so users can only manage their own company records.

### 2. Professional History UI (Frontend)
- [ ] **Data Hooks**
    - [ ] Update `apps/frontend/src/hooks/use-account.ts` to include `useCompanies` and `useAddCompany` hooks.

- [ ] **Work Experience Components**
    - [ ] Create `apps/frontend/src/components/profile/company-list/` directory.
    - [ ] Implement `company-list-dumb.tsx`:
        - [ ] Responsive list of previous/current companies with logos (if applicable) and dates.
    - [ ] Implement "Add Company" modal/form:
        - [ ] Input fields for Company Name and Joined Date.
        - [ ] Integration with TanStack Query mutations for optimistic updates.

## Files to be Added/Changed
- **New Files**:
    - `apps/frontend/src/components/profile/company-list/company-list-dumb.tsx`
- **Modified Files**:
    - `packages/shared-backend/src/account/account-repository.ts`
    - `packages/shared-backend/src/account/account-controller.ts`
    - `packages/shared-backend/src/account/types.ts`
    - `apps/frontend/src/hooks/use-account.ts`
    - `apps/frontend/src/routes/settings/profile/profile-dumb.tsx` (to integrate the company list)

## End Goal
Users can build a professional profile by listing their previous and current companies, which will serve as the foundation for interviewer verification and premium feature access.
