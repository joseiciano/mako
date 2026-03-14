# Story 3.2: Mobile Responsive Navigation (Layout 3-2)

**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Implement a mobile-first responsive navigation system using a top header hamburger menu and a slide-out drawer.
**Status**: Todo
**Prerequisite**: [Story 3.1: App Shell & Desktop Navigation](./3-1-layout-app-shell.md)

## Implementation Plan

### 1. Mobile Navigation Components
- [ ] **Implement Mobile Navigation Shell**
    - [ ] Create `apps/frontend/src/components/layout/mobile-nav/` directory.
    - [ ] Implement `mobile-nav-dumb.tsx`:
        - [ ] Implement a slide-out drawer or overlay containing all navigation links.
        - [ ] Ensure the drawer is accessible (ARIA roles, focus trapping).
        - [ ] Add a close button and backdrop click-to-close functionality.

### 2. Hamburger Toggle & Responsive Logic
- [ ] **Update Header for Mobile**
    - [ ] Modify `apps/frontend/src/components/layout/header/header-dumb.tsx`:
        - [ ] Enable the "Hamburger" menu button visible only on smaller viewports (`lg:hidden`).
        - [ ] Connect the button to the mobile drawer state.

- [ ] **Responsive Design (Mobile-First)**:
    - [ ] Use Tailwind `lg:` breakpoints to hide the hamburger menu and drawer while showing the fixed sidebar on larger screens.
    - [ ] Ensure consistent padding and spacing across all viewport sizes.

## Files to be Added/Changed
- **New Files**:
    - `apps/frontend/src/components/layout/mobile-nav/mobile-nav-dumb.tsx`
- **Modified Files**:
    - `apps/frontend/src/components/layout/header/header-dumb.tsx`

## End Goal
A fully responsive navigation experience. Users on small screens access navigation via a hamburger menu in the header, while desktop users see a persistent sidebar. The transition between these states is seamless and accessible.
