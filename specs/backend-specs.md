# Backend Structure Spec

Date: 2026-01-18
Owner: platform
Status: draft

## Goal
Restructure the backend from a single `index.ts` entrypoint into a modular architecture with clear separation of concerns that matches the desired layout style:

```
api/
  package.json
  tsconfig.json
  src/
    main.ts
    config/
    shared/
    modules/
      analytics/
      identity/
      accounts/
      integrations/
```

This is a structural target only; folders will be created incrementally as part of implementation.

## Scope
- Extract routing, business logic, and persistence into module-oriented layers.
- Centralize configuration, shared utilities, and auth handling.
- Preserve current behavior while refactoring.

## Non-Goals
- Introducing new product features beyond the existing endpoints.
- Fully implementing analytics (placeholder only).

## Current State Summary
- `apps/backend/src/index.ts` contains server creation, routing, validation, business logic, and direct Prisma queries.
- Clerk auth verification exists in `apps/backend/src/auth/clerk.ts` and is called directly from `index.ts`.

## Target Architecture

### Entry
- `src/main.ts`
  - Creates the HTTP server and registers routes.
  - Wires global middleware (logging, error handling, JSON parsing).

### Config
- `src/config/`
  - Centralized environment parsing and constants (server port, Clerk JWKS URL, etc.).

### Shared
- `src/shared/`
  - `db/` Prisma client singleton and connection lifecycle.
  - `http/` error types, response helpers, request context types.
  - `auth/` Clerk token verification + auth context resolution.
  - `utils/` common helpers (e.g., JSON body parsing).

### Modules
Each module follows a consistent internal shape:
- `routes/` route registration only
- `controllers/` HTTP handlers (validation + response shaping)
- `services/` business logic
- `repositories/` Prisma access only
- `types/` DTOs and module-specific types

Modules:
- `modules/identity`
  - User/org sync, membership sync, auth-protected endpoints.
- `modules/accounts`
  - Account creation and onboarding step for account.
- `modules/integrations`
  - Amazon Ads/Seller/Vendor OAuth flows and integration status.
- `modules/analytics`
  - Placeholder for future analytics endpoints.

## Endpoint Mapping (Phase 1)
Move current endpoints into `modules/identity` and `shared`:
- `GET /api/health` -> shared health route.
- `GET /api/v1/protected` -> identity controller (auth required).
- `POST /api/v1/auth/sync` -> identity controller + user service.
- `POST /api/v1/orgs` -> identity controller + org service.
- `GET /api/v1/orgs/me` -> identity controller + org service.
- `POST /api/v1/orgs/sync` -> identity controller + org service.
- `POST /api/v1/org_memberships/sync` -> identity controller + membership service.

## Cross-Cutting Patterns
- **Auth Context:** resolve Clerk `userId` and `orgId` once per request; pass to handlers.
- **Error Model:** consistent error types mapped to HTTP status codes.
- **Validation:** minimal schema validation per endpoint (can be upgraded later).

## Implementation Plan (Incremental)
1. Extract Prisma client to `shared/db/prisma.ts` and update imports.
2. Extract JSON body parsing to `shared/utils/readJsonBody.ts`.
3. Create `shared/auth` wrapper around Clerk helpers for request context.
4. Split `index.ts` into `main.ts` (server bootstrap) + module route registration.
5. Move identity endpoints into `modules/identity` (routes/controllers/services/repositories).
6. Add placeholders for `modules/accounts`, `modules/integrations`, `modules/analytics`.
7. Add shared error handling and request validation utilities.

## Implementation Status
- [x] Create repository-root `npm` scripts and an `api/` package so build/typecheck/lint/test can run from the repository root.
- [x] Scaffold `api/src/main.ts`, shared HTTP utilities, and placeholder module registration in the target modular layout.
- [x] Implement the phase 1 identity endpoint surface with module-level routes, controllers, services, and in-memory repositories.
- [x] Replace the temporary in-memory identity repository with shared database access under `shared/db/`.
- [x] Replace header-based auth context resolution with Clerk-backed request auth in `shared/auth/`.
- [ ] Add the remaining accounts and integrations behavior behind their placeholder modules.

## Acceptance Criteria
- No behavior changes for existing endpoints.
- All identity endpoints live under `modules/identity` with clear separation of routing, services, and repositories.
- Shared auth and db utilities live in `shared/`.
- Entry file only bootstraps server + registers routes.

## Risks
- Partial refactor can lead to duplicated logic if not completed per module.
- Care needed to keep Clerk auth handling identical during extraction.

## Open Questions
- Which HTTP framework is preferred for the final structure (Fastify vs Express vs Nest)?
- Do we want a shared validation library (zod/valibot) or minimal custom validators?
