# Story 4.3: Auth UI: Login & Signup
**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Implement the user-facing login and signup pages using the smart-dumb component pattern.
**Status**: Completed

## What Needs to Be Done

### 1. Signup Page Implementation
- [x] Create `apps/frontend/src/routes/auth/signup/` directory.
- [x] Implement `signup-smart.tsx` to handle the `authClient.signUp.email` call.
- [x] Implement `signup-dumb.tsx` with fields for Name, Email, and Password, following the design system.

### 2. Login Page Implementation
- [x] Create `apps/frontend/src/routes/auth/login/` directory.
- [x] Implement `login-smart.tsx` to handle the `authClient.signIn.email` call.
- [x] Implement `login-dumb.tsx` with fields for Email and Password.

### 3. Global Auth Actions
- [x] Add "Sign Out" functionality to the user menu in the application shell.
- [x] Ensure proper redirects after successful login/signup.

## End Goal
Users can successfully create accounts and log in to the application via a polished, validated user interface.
