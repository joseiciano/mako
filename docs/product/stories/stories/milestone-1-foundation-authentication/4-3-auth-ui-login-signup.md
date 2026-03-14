# Story 4.3: Auth UI: Login & Signup
**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Implement the user-facing login and signup pages using the smart-dumb component pattern.
**Status**: Todo

## What Needs to Be Done

### 1. Signup Page Implementation
- [ ] Create `apps/frontend/src/routes/auth/signup/` directory.
- [ ] Implement `signup-smart.tsx` to handle the `authClient.signUp.email` call.
- [ ] Implement `signup-dumb.tsx` with fields for Name, Email, and Password, following the design system.

### 2. Login Page Implementation
- [ ] Create `apps/frontend/src/routes/auth/login/` directory.
- [ ] Implement `login-smart.tsx` to handle the `authClient.signIn.email` call.
- [ ] Implement `login-dumb.tsx` with fields for Email and Password.

### 3. Global Auth Actions
- [ ] Add "Sign Out" functionality to the user menu in the application shell.
- [ ] Ensure proper redirects after successful login/signup.

## End Goal
Users can successfully create accounts and log in to the application via a polished, validated user interface.
