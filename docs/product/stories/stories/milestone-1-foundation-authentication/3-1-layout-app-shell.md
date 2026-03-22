# Story 3.1: App Shell & Desktop Navigation (Layout 3-1)

**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Build the foundational desktop application shell with a top header bar and global navigation.
**Status**: Completed
**Prerequisite**: [Account Management](./account-management.md)

## Implementation Plan

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

- [x] **Implement Header Navigation Bar (Desktop)**
    - [x] Keep global navigation in the top header bar for desktop views.
    - [x] Include application logo and primary navigation links in header context.

### 3. Header & User Menu
- [x] **Integrate Header/Top Bar**
    - [x] Create `apps/frontend/src/components/layout/header/` directory.
    - [x] Implement `header-dumb.tsx`:
        - [x] Display page title or Breadcrumbs based on the current route.
        - [x] Add a placeholder for the "Hamburger" button (to be implemented in 1.7).
        - [x] Add a `UserMenu` component (dropdown) containing the user's name, profile link, and a Logout button.

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
A functional desktop shell with a top header bar containing global navigation and a user menu. Navigation items are clearly visible, Billing is grouped under Settings, and the current active page is indicated.
