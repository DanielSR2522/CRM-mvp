# SmarTrack CRM

SmarTrack is an insurance-agency CRM built with Next.js, React, TypeScript and Supabase.

This repository is the source of truth for application code. Production changes must be reviewed from a branch before they reach `main`.

## Stack

- Next.js App Router
- React + TypeScript
- Supabase (Postgres, Auth, Storage and RLS)
- Tailwind CSS
- Vercel deployment target

## Local development

1. Install dependencies:

```bash
npm ci
```

2. Copy the environment template:

```bash
cp .env.example .env.local
```

3. Fill only the values required for the feature you are running. Never commit `.env.local` or real secrets.

4. Start the CRM on the project development port:

```bash
npm run dev -- --port 3001
```

Open `http://localhost:3001`.

## Validation before merge

At minimum, run:

```bash
npm run lint
npm run build
```

A change is not considered ready merely because an AI coding agent says it is complete. Review the diff and verify the affected user flow.

## Repository rules

- `main` must remain stable.
- Use one short-lived branch per task.
- Do not commit `.env*` files other than `.env.example`.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, encryption keys, passwords, MFA secrets, carrier credentials or tokens to browser code or logs.
- Database changes must be represented by an auditable SQL migration; do not rely on an undocumented one-off database mutation.
- Temporary diagnostics belong in ignored local scratch space, not in committed production history.
- Do not duplicate business logic to satisfy one screen. Shared rules belong in `src/lib` or another canonical domain module.
- Preserve RLS boundaries. Server-side service-role access is exceptional and must validate authorization explicitly.

## Project layout

- `src/app/` — routes and App Router surfaces
- `src/components/` — reusable UI components
- `src/lib/` — domain and infrastructure logic
- `src/types/` — shared TypeScript types
- `src/utils/` — generic utilities
- `docs/` — architecture, security and operational documentation
- root `migration*.sql` — historical SQL migrations in the current repository layout; do not add more ad-hoc root migrations without first consolidating the migration strategy

## Security

The server-only Supabase admin client is in `src/lib/supabaseAdmin.ts`. It uses `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS. Do not import it from Client Components and never return or log the key.

See:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/SECURITY.md`](docs/SECURITY.md)
- [`docs/REPOSITORY_AUDIT.md`](docs/REPOSITORY_AUDIT.md)

## Current repository audit

A repository hygiene audit was started on 2026-08-27 in branch `cleanup/2026-08-27-repo-audit`.

Important: the GitHub `main` snapshot audited here was last committed on 2026-08-21. Carrier automation work discussed or developed after that date is not present on any GitHub branch visible during the audit. Destructive cleanup of temporary files and architecture changes must wait until the latest working copy is pushed and reconciled, so newer work cannot be lost.
