# Story 3.2: Mobile Responsive Navigation (Layout 3-2)

**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Implement a mobile-first responsive navigation system using a top header hamburger menu and a slide-out drawer.
**Status**: Completed
**Prerequisite**: [Story 3.1: App Shell & Desktop Navigation](./3-1-layout-app-shell.md)

## Implementation Plan

### 1. Mobile Navigation Components
- [x] **Implement Mobile Navigation Shell**
    - [x] Create `apps/frontend/src/components/layout/mobile-nav/` directory.
    - [x] Implement `mobile-nav-dumb.tsx`:
        - [x] Implement a slide-out drawer or overlay containing all navigation links.
        - [x] Ensure the drawer is accessible (ARIA roles, focus trapping).
        - [x] Add a close button and backdrop click-to-close functionality.

### 2. Hamburger Toggle & Responsive Logic
- [x] **Update Header for Mobile**
    - [x] Modify `apps/frontend/src/components/layout/header/header-dumb.tsx`:
        - [x] Enable the "Hamburger" menu button visible only on smaller viewports (`lg:hidden`).
        - [x] Connect the button to the mobile drawer state.

- [x] **Responsive Design (Mobile-First)**:
    - [x] Use Tailwind `lg:` breakpoints to hide the hamburger menu and drawer while showing the fixed sidebar on larger screens.
    - [x] Ensure consistent padding and spacing across all viewport sizes.

## Files to be Added/Changed
- **New Files**:
    - `apps/frontend/src/components/layout/app-shell/app-shell-dumb.tsx`
    - `apps/frontend/src/components/layout/app-shell/app-shell-smart.tsx`
    - `apps/frontend/src/components/layout/app-shell/app-shell-smart.test.tsx`
    - `apps/frontend/src/components/layout/header/header-dumb.tsx`
    - `apps/frontend/src/components/layout/mobile-nav/mobile-nav-dumb.tsx`
    - `apps/frontend/src/components/layout/mobile-nav/mobile-nav-dumb.test.tsx`
    - `apps/frontend/src/components/layout/navigation/nav-items.ts`
    - `apps/frontend/src/components/layout/navigation/navigation-dumb.tsx`
    - `apps/frontend/src/components/layout/sidebar/sidebar-dumb.tsx`
- **Modified Files**:
    - `apps/frontend/src/routes/index.tsx`

## End Goal
A fully responsive navigation experience. Users on small screens access navigation via a hamburger menu in the header, while desktop users see a persistent sidebar. The transition between these states is seamless and accessible.
