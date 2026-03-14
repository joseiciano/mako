# Story 3.1: App Shell & Desktop Navigation (Layout 3-1)

**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Build the foundational desktop application shell with a fixed sidebar and top header.
**Status**: Todo
**Prerequisite**: [Account Management](./account-management.md)

## Implementation Plan

### 1. App Shell Architecture (Frontend)
- [ ] **Define Responsive App Shell Architecture**
    - [ ] Create `apps/frontend/src/components/layout/app-shell/` directory.
    - [ ] Implement `app-shell-smart.tsx`:
        - [ ] Handle sidebar collapse/expand state for desktop.
    - [ ] Implement `app-shell-dumb.tsx`:
        - [ ] Define the structural layout using **Tailwind CSS** (Grid/Flexbox) for the main content area, sidebar, and top header.
        - [ ] Ensure content area is scrollable while sidebar remains fixed.

### 2. Desktop Navigation Components
- [ ] **Develop Global Navigation Components**
    - [ ] Create `apps/frontend/src/components/layout/navigation/` directory.
    - [ ] Implement `navigation-smart.tsx`:
        - [ ] Use **TanStack Start** `useRouter` hooks to identify the active route and apply active styles.
    - [ ] Implement `navigation-dumb.tsx`:
        - [ ] List links for core features: Dashboard (`/dashboard`), Interviews (`/interviews`), Billing (`/billing`), and Settings (`/settings`).
        - [ ] Integrate **Lucide** icons for each navigation item.

- [ ] **Implement Sidebar (Desktop)**
    - [ ] Create `apps/frontend/src/components/layout/sidebar/` directory.
    - [ ] Implement `sidebar-dumb.tsx`:
        - [ ] Fixed-position, full-height sidebar for desktop views (`hidden lg:flex`).
        - [ ] Include application logo and navigation links.

### 3. Header & User Menu
- [ ] **Integrate Header/Top Bar**
    - [ ] Create `apps/frontend/src/components/layout/header/` directory.
    - [ ] Implement `header-dumb.tsx`:
        - [ ] Display page title or Breadcrumbs based on the current route.
        - [ ] Add a placeholder for the "Hamburger" button (to be implemented in 1.7).
        - [ ] Add a `UserMenu` component (dropdown) containing the user's name, profile link, and a Logout button.

## Files to be Added/Changed
- **New Files**:
    - `apps/frontend/src/components/layout/app-shell/app-shell-smart.tsx`
    - `apps/frontend/src/components/layout/app-shell/app-shell-dumb.tsx`
    - `apps/frontend/src/components/layout/navigation/navigation-smart.tsx`
    - `apps/frontend/src/components/layout/navigation/navigation-dumb.tsx`
    - `apps/frontend/src/components/layout/sidebar/sidebar-dumb.tsx`
    - `apps/frontend/src/components/layout/header/header-dumb.tsx`

## End Goal
A functional desktop shell with a fixed sidebar and a top header containing a user menu. Navigation items are clearly visible and indicate the current active page.
