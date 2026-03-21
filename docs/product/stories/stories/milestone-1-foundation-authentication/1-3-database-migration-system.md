# Story 1.3: Database Migration System & Initial Schema

**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Implement a lightweight SQL migration system and apply the initial database schemas.
**Status**: In-Review

## What Needs to Be Done

### 1. Migration Tooling
- [x] Set up a system for managing raw SQL migrations (e.g., using a lightweight migration tool or custom scripts) as defined in `docs/system/system-design/db-schemas.md`.
- [x] Create a standard workflow for developers to create and apply new migrations.

### 2. Initial Schema Implementation
- [x] Implement the `Users`, `User_Companies`, `Availability_Requests`, and `Availability_Slots` initial foundation tables in SQL.
- [x] Ensure all database interactions maintain strict manual type safety in the shared packages.

## End Goal
A versioned database migration system is in place, and the initial database schema is applied to the Neon Postgres instances.
