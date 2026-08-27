# SmarTrack Architecture

## Purpose

This document defines the architectural boundaries that future contributors and coding agents must preserve. It is intentionally conservative: extend the system through clear modules rather than by adding feature-specific shortcuts.

## Application layers

```text
Browser / CRM UI
        |
        v
Next.js routes and application surfaces
        |
        v
Domain modules in src/lib
        |
        +----------------------+
        |                      |
        v                      v
Supabase client access     Server-only privileged access
(RLS enforced)             (explicit validation required)
        |
        v
Supabase: Postgres / Auth / Storage / RLS
```

Automation that runs outside the web application must remain a separate operational boundary. It may write normalized data to Supabase, but browser UI must not contain portal credentials or browser-automation logic.

## Source-of-truth rules

1. `main` is the stable integration branch.
2. Supabase is the canonical persistent store for CRM data.
3. Shared business rules must have one canonical implementation.
4. UI components should render or invoke domain behavior; they should not each reinvent policy/payment/status rules.
5. Database schema changes require versioned, reviewable SQL.
6. A successful sync/import must never be replaced in the UI by a partial or failed run.

## Directory responsibilities

### `src/app`

Routing, pages, layouts and route handlers. Authentication/authorization must be enforced server-side where required; hiding a UI element is not authorization.

### `src/components`

Reusable presentation and interaction components. Avoid direct privileged database access.

### `src/lib`

Canonical domain and infrastructure logic. Existing domains include authentication, calendar, consents, delivery, documents, formatting, health, leads, marketplace, notes, payments and signatures.

### `src/lib/supabaseAdmin.ts`

Privileged server-only Supabase client. Treat this as a security boundary. Service-role access bypasses RLS and therefore requires explicit validation by every public-facing server path that uses it.

### `src/types` and `src/utils`

Shared types and generic utilities. Domain-specific behavior should remain in a domain module rather than becoming a generic helper merely for reuse.

## Carrier automation target boundary

The GitHub snapshot audited on 2026-08-27 does not contain the recent Oscar/Ambetter worker implementation, so this section defines the integration contract rather than claiming the implementation is present.

Each carrier integration should be isolated behind a common lifecycle conceptually equivalent to:

```text
connect / authenticate
sync book of business
sync payment state
normalize carrier-specific data
persist staged run
promote successful run
health / reauthentication state
```

Carrier-specific selectors and portal navigation must not leak into CRM UI components. Normalized records are the contract between automation and the CRM.

## Change discipline

For every non-trivial change:

1. Branch from the current stable `main`.
2. Read this document and `SECURITY.md` before editing.
3. Keep scope narrow.
4. Run lint/build and any focused tests.
5. Review the diff for unrelated edits, generated files, secrets and debug output.
6. Merge only after the affected flow is manually verified.

Coding agents are executors, not independent architecture authorities. If an agent proposes a new framework, parallel data model, duplicate Supabase client, or alternative source of truth, stop and review the design before accepting it.
