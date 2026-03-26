# Story: Professional History Management
**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Implement company history tracking to enable future interviewer verification and personalized matching.
**Status**: Completed

## Implementation Plan

### 1. Company History API (Backend)
- [x] **Repository Layer**
    - [x] Extend `AccountRepository` (or create `CompanyRepository`) to interact with the `User_Companies` table.
    - [x] Implement `getCompaniesByUserId` and `addCompanyRecord`.

- [x] **API Logic**
    - [x] Define Zod schemas in `packages/shared-backend/src/account/types.ts` for company records (name, join date).
    - [x] Add `GET /api/companies` and `POST /api/companies` to the `AccountController`.
    - [x] Ensure proper validation so users can only manage their own company records.

### 2. Professional History UI (Frontend)
- [x] **Data Hooks**
    - [x] Update `apps/frontend/src/hooks/use-account.ts` to include `useCompanies` and `useAddCompany` hooks.

- [x] **Work Experience Components**
    - [x] Create `apps/frontend/src/components/profile/company-list/` directory.
    - [x] Implement `company-list-dumb.tsx`:
        - [x] Responsive list of previous/current companies with logos (if applicable) and dates.
    - [x] Implement "Add Company" modal/form:
        - [x] Input fields for Company Name and Joined Date.
        - [x] Integration with TanStack Query mutations for optimistic updates.

## Files to be Added/Changed
- **New Files**:
    - `packages/shared-backend/src/account/index.ts`
    - `packages/shared-backend/src/account/account-service.ts`
    - `packages/shared-backend/src/account/account-controller.test.ts`
    - `packages/shared-backend/src/account/account-repository.test.ts`
    - `packages/shared-backend/src/account/account-controller.ts`
    - `packages/shared-backend/src/account/types.ts`
    - `apps/frontend/src/components/profile/company-list/company-list-smart.tsx`
    - `apps/frontend/src/components/profile/company-list/index.ts`
    - `apps/frontend/src/components/profile/company-list/types.ts`
    - `apps/frontend/src/components/profile/company-list/company-list-dumb.tsx`
    - `apps/frontend/src/components/profile/company-list/company-list-dumb.test.tsx`
    - `apps/frontend/src/hooks/use-account.ts`
    - `apps/frontend/src/hooks/use-account.test.ts`
    - `apps/frontend/src/routes/settings/profile/index.tsx`
    - `apps/frontend/src/routes/settings/profile/profile-smart.tsx`
    - `apps/frontend/src/routes/settings/profile/profile-dumb.tsx`
- **Modified Files**:
    - `apps/backend-rest/src/index.ts`
    - `apps/frontend/package.json`
    - `apps/frontend/src/routes/__root.tsx`
    - `apps/frontend/src/routeTree.gen.ts`
    - `packages/shared-backend/package.json`
    - `packages/shared-backend/src/index.ts`
    - `packages/shared-backend/src/account/account-repository.ts`
    - `docs/product/stories/stories/milestone-1-foundation-authentication/2-2-professional-history-management.md`

## End Goal
Users can build a professional profile by listing their previous and current companies, which will serve as the foundation for interviewer verification and premium feature access.
