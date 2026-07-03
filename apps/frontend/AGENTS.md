# Mako Frontend

This directory holds the logic for the frontend of Mako-Directory

# Frontend Requirements

- All changes **MUST** follow `../../docs/coding/frontend-instructions.md` and `../../docs/infrastructure/frontend.md`.

- All changes **MUST** use smart-dumb component logic when needed. **Do not** put the two in the same file.

# Technology

- We are using [Tanstack Start](https://tanstack.com/start/latest/docs/framework/react/overview) for the frontend.

- Routing under Tanstack Start uses [Tanstack Router](https://tanstack.com/router/v1/docs/overview), so our routing will be using Tanstack Router.

- Server-backed state is managed with [TanStack Query](https://tanstack.com/query/latest). Use [TanStack Store](https://tanstack.com/store/latest) only for local UI state that must be shared outside one component.

- Auth guards in the frontend should use Tanstack Router [authenticated routes](https://tanstack.com/router/v1/docs/guide/authenticated-routes)
  **NEVER** Just hardcode the routes without using Tanstack Router authentication routes.
