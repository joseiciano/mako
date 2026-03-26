# Project Agents

This file provides guide and memory for LLM agents across all projects in this codebase.

## General Coding Practices Across the Codebase

The following is useful information for working across the whole codebase, both frontend and backend.

### Goals

- You work to generate reliable, readable, and easily maintable code.
- You prioritize proven solutions with the given tools over bleeding-edge technologies and methods, unless requested.
- You are a completionist. You strive to implement complete finished working code, avoiding placeholders like "// TODO" unless otherwise specified.
- When it comes to modifying existing code, you try to minimize changes to minimize risk. You try to maintain backwards compatibility unless otherwise specified.
- You optimize for performance when you can while maintaining a clear border with premature optimization.
- You are careful to not abstract too much. When there are functions and logic that are the same, you will re-use/abstract as needed, but you will not create multiple layers to allow one function to support any type of case.
- You are a fan of practicing YAGNI, DRY, and KISS for best coding practices
- You are a fan of small files. You try to keep files based around 1-2 core functions, splitting the rest into helper files that exist within the package as needed.

### Code Quality Standards

Your implementations must demonstrate:

- **Clean Code**: Follow naming conventions, proper indentation, and logical organization
- **Modularity**: Create reusable, focused components
- **Testability**: Write code that can be easily unit and integration tested
- **Documentation**: Add docstrings, comments for complex logic, and README updates when needed
- **Type Safety**: Use type hints/annotations when the language supports it
- **Error Handling**: Never silently fail - always handle or surface errors appropriately

### Small, Simple Commits

When developing, you try to keep commits small and clean. You want them focused around a small feature of what is being developed. This helps the reviewer come code review time, and helps you if you need to go back on any changes.

When developing:

- Try to keep commits small. If you are working on two components for a feature, for example, split them into two commits.
- Have commit names be concise and detailed. I, as the reviewer, should have a good idea of what is being done in the commits.

### Never Push Commits or Create Pull Requests Without Permission

When developing, you may create commits for the worktree you are working on. However, **NEVER** push the commits. Wait for human review to approve and do it manually or to approve you to push it and create a Pull Request.

### Packages vs In-App

Use packages for the followed:

- Shared data types between multiple applications
- Shared http api request/response shapes

Use in app if you see the logic you are building is unique to this one application. If you see yourself writing something in two places at once, best to refactor into a package.

### Types

When creating types, you prefer to use `type` over `interface`. You only use `interface` when handling classes.

## Infrastructure

Reference `../docs/infrastructure/backend.md` for backend services.

Reference `../docs/infrastructure/frontend.md` for frontend services.

**NOTE**: We are speaking to our postgres database directly with SQL queries, speaking to it with Cloudflare Hyperdrive. We are not, and never will be using an orm. Never recommend an orm, never use an orm, never mention an orm.

**NOTE**: If we ever need to add a new service that requires a new secret to be added to our github deployment actions, update `./scripts/set-github-env-secrets.sh` to include this new value. This script is to be used to manually setup the secrets, as well as to act as documentation for what is needed. 

## Git

Reference `./docs/system/system-design/ci-cd.md` on how to use Git and create Pull Requests

**ALWAYS REFERENCE THIS GIT FILE WHEN CREATING COMMITS OR PULL REQUESTS**
