# Story 3.1: App Shell & Desktop Navigation (Layout 3-1)

**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Build the foundational desktop application shell with a top header bar and initial desktop global navigation baseline.
**Status**: Completed
**Prerequisites**:
- [Story: User Profile & Quotas](./2-1-user-profile-quotas.md)
- [Story: Professional History Management](./2-2-professional-history-management.md)
- [Story: Account Security & Deletion](./2-3-account-security-deletion.md)
**Last reconciled**: 2026-03-30 (Documentation Drift Resolution Plan)

## What Needs to Be Done

### 1. App Shell Architecture (Frontend)
- [x] **Define Responsive App Shell Architecture**
    - [x] Create `apps/frontend/src/components/layout/app-shell/` directory.
    - [x] Implement `app-shell-smart.tsx`:
        - [x] Handle route-derived header context and shell wiring.
    - [x] Implement `app-shell-dumb.tsx`:
        - [x] Define the structural layout using **Tailwind CSS** (Flexbox) for the main content area and top header bar.
        - [x] Ensure content area is scrollable while the header remains sticky.

### 2. Desktop Navigation Components
- [x] **Develop Global Navigation Components**
    - [x] Create `apps/frontend/src/components/layout/navigation/` directory.
    - [x] Implement `navigation-smart.tsx`:
        - [x] Use **TanStack Start** `useRouter` hooks to identify the active route and apply active styles.
    - [x] Implement `navigation-dumb.tsx`:
        - [x] List links for core features: Dashboard (`/dashboard`), Interviews (`/interviews`), and Settings (`/settings`) with Billing nested under Settings.
        - [x] Integrate **Lucide** icons for each navigation item.

- [x] **Implement Header Navigation Bar (Desktop Baseline)**
    - [x] Keep global navigation in the top header bar for this initial desktop baseline.
    - [x] Include application logo and primary navigation links in header context.
    - [x] Migration note: Story 3.2 moves the canonical desktop global navigation to a persistent sidebar while retaining the top header for page context and user controls.

### 3. Header & User Menu
- [x] **Integrate Header/Top Bar**
    - [x] Create `apps/frontend/src/components/layout/header/` directory.
    - [x] Implement `header-dumb.tsx`:
        - [x] Display page title or Breadcrumbs based on the current route.
        - [x] Add a placeholder for the "Hamburger" button (implemented in Story 3.2).
        - [x] Add a `UserMenu` component (dropdown) containing the user's name, profile link, and a Sign out button.

## Files to be Added/Changed
- **New Files**:
    - `apps/frontend/src/components/layout/app-shell/app-shell-smart.tsx`
    - `apps/frontend/src/components/layout/app-shell/app-shell-dumb.tsx`
    - `apps/frontend/src/components/layout/app-shell/app-shell-dumb.test.tsx`
    - `apps/frontend/src/components/layout/navigation/navigation-smart.tsx`
    - `apps/frontend/src/components/layout/navigation/navigation-dumb.tsx`
    - `apps/frontend/src/components/layout/navigation/navigation-smart.test.ts`
    - `apps/frontend/src/components/layout/header/header-dumb.tsx`
    - `apps/frontend/src/components/layout/header/header-dumb.test.ts`

## End Goal
A functional desktop shell baseline with a top header bar, global navigation, and a user menu. Story 3.2 then finalizes the canonical desktop navigation architecture as a persistent sidebar with mobile drawer parity.
