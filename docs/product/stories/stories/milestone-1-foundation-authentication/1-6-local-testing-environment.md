# Story 1.6: Local Testing Environment Setup

**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Establish a consistent local testing environment so developers can run reliable tests before opening PRs.
**Status**: Todo

## What Needs to Be Done

### 1. Test Tooling & Workspace Scripts
- [ ] Standardize test tooling/configuration across the monorepo for frontend, backend, and shared packages.
- [ ] Add root-level scripts for common workflows (e.g., run all tests, watch mode, and coverage).

### 2. Local Test Environment Configuration
- [ ] Create and document a `.env.test.example` with all required test-time environment variables.
- [ ] Configure isolated local test resources (including database setup/reset flow) so tests are repeatable and do not affect development data.

### 3. One-Command Local Environment Stand-Up
- [ ] Add a single root-level command that boots the full local stack required for testing (frontend, backend, local Workers infrastructure/emulators, and local database).
- [ ] Ensure the same command supports clean teardown/reset so developers can reliably restart from a known state.

### 4. Baseline Validation & Documentation
- [ ] Add baseline smoke tests in key apps/packages to validate the setup works end-to-end locally.
- [ ] Document step-by-step local test setup and execution in project docs, including common troubleshooting notes.

## End Goal
A developer can clone the repository, run one command to stand up the full local test environment, and execute consistent local tests with predictable results.
