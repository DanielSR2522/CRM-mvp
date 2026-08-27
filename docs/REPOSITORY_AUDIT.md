# Repository Audit — 2026-08-27

## Scope

Audit target: `DanielSR2522/CRM-mvp`.

Audit branch: `cleanup/2026-08-27-repo-audit`.

Baseline `main` commit at audit start: `2bdb85b2781a0fcb50ed4e844e0fd888959aeaf1` (`checkpoint: consents documents images and pc polish`, committed 2026-08-21).

## Critical repository-state finding

The GitHub baseline does not contain the recent carrier automation implementation expected from later development work. Searches for Oscar/Ambetter/Playwright do not reveal a carrier worker implementation in application code, and `package.json` does not declare the expected worker/browser tooling.

All pre-existing feature branches visible during the audit are older than `main`; none contains the missing newer work.

**Consequence:** this cleanup branch must not be merged over a newer local working copy until that working copy is committed/pushed and reconciled. GitHub is currently not a complete source of truth for the latest development state.

## Findings

### 1. Committed scratch tooling — high priority

The repository tracked a large `scratch/` directory even though `.gitignore` already ignores `scratch/`.

The directory included one-off database inspection/mutation utilities and admin-auth helpers. An inspected example read `.env.local`, constructed a service-role Supabase client and generated a magic login link for a concrete account.

Action on cleanup branch: remove the tracked `scratch/` tree. This does not rewrite Git history.

### 2. README was starter boilerplate — high priority

The previous README was the default create-next-app text and referenced port 3000. It did not document the CRM, data/security model or merge discipline.

Action: replaced with a SmarTrack-specific project guide using the established local port 3001.

### 3. Security boundary for service role — preserve

`src/lib/supabaseAdmin.ts` explicitly treats service-role access as server-only, caches a server client, avoids exposing the key and documents validation obligations. This is a good boundary and should not be casually refactored.

Action: preserve and document as canonical privileged-access path.

### 4. Environment template — preserve

`.env.example` documents names only and clearly separates public and server-only variables. `.gitignore` excludes `.env*` while explicitly allowing the template.

Action: preserve. Real keys must never be added to the template.

### 5. Migrations are fragmented at repository root — medium priority

Many historical `migration*.sql` files live at repository root. Moving or renaming them blindly would damage traceability and may separate SQL from the way it was applied.

Action during this audit: do not move them. After the newest working copy is reconciled, inventory applied vs unapplied migrations and select one canonical future migration location/workflow.

### 6. No repository quality gate — high priority

The audited baseline had no visible GitHub Actions quality workflow.

Action: add `.github/workflows/quality.yml` to run `npm ci`, ESLint and `tsc --noEmit` for pull requests to `main` and pushes to `main`.

### 7. Carrier architecture cannot yet be audited — critical follow-up

Because the recent carrier implementation is absent from GitHub, the audit cannot truthfully verify:

- Playwright/browser credential handling
- Oscar/Ambetter selectors and login/session storage
- worker heartbeat/stale-job behavior
- 8-hour scheduler implementation
- stage/promote snapshot behavior
- payment synchronization
- reauthentication state handling

These must be audited from the actual latest working copy after it is pushed.

## Changes made on audit branch

- Replaced generic `README.md` with SmarTrack operating documentation.
- Added `docs/ARCHITECTURE.md`.
- Added `docs/SECURITY.md`.
- Added this audit record.
- Added `.github/workflows/quality.yml`.
- Removed tracked `scratch/` tree from the cleanup branch.

## Explicitly not changed

- No production business logic refactor.
- No RLS policy or database mutation.
- No migration relocation/deletion.
- No dependency upgrade/removal.
- No environment secret rotation.
- No `main` mutation.

These exclusions are intentional because the GitHub baseline is older than the newest development work.

## Required reconciliation before final cleanup

1. Commit and push the newest working copy that contains the carrier work.
2. Confirm its branch/commit as the new audit base.
3. Rebase or recreate these hygiene changes on that base.
4. Run static checks and repair failures.
5. Audit carrier automation and secrets from the actual code.
6. Inventory and normalize migrations/scripts.
7. Review dependency usage and remove only dependencies proven unused.
8. Run build and focused critical-flow tests.
9. Merge only after the resulting diff is understood and clean.

## Definition of "clean"

The repository is clean when:

- GitHub contains the actual latest working state.
- `main` is reproducible from documented setup.
- no committed temporary admin tooling remains.
- secrets stay out of source/history going forward.
- migrations have one documented process.
- lint/typecheck/build pass from a clean install.
- critical authentication, RLS, client/profile, policy, payment and carrier-sync flows are verified.
- future coding agents can understand the architecture before editing it.
