# SmarTrack Security

## Security boundaries

SmarTrack contains insurance-client data and must be treated as a sensitive business application. Security decisions take priority over convenience in local scripts or AI-generated changes.

## Secrets

Never commit, print, expose to browser code, or place in screenshots/logs:

- `SUPABASE_SERVICE_ROLE_KEY`
- `HEALTH_DATA_ENCRYPTION_KEY`
- database passwords or connection strings
- carrier usernames/passwords
- MFA seeds, recovery codes or session cookies
- API secrets such as `RESEND_API_KEY` or `CRON_SECRET`
- generated magic-login/action links

`.env.local` and all real environment files remain ignored. `.env.example` contains variable names only.

If a secret is ever committed, deleting the file in a later commit is not sufficient. Treat the secret as compromised and rotate it. History cleanup, when appropriate, is a separate repository-administration decision.

## Supabase

### Browser/client access

Use the public Supabase URL and anon key. Authorization depends on authenticated identity and RLS; the anon key itself is not a privileged secret.

### Service-role access

`SUPABASE_SERVICE_ROLE_KEY` bypasses every RLS policy. The canonical privileged client is `src/lib/supabaseAdmin.ts`.

Rules:

1. Never import the admin client into a Client Component.
2. Never create a second ad-hoc service-role client merely to make a feature work.
3. Every public route using privileged access must validate the request explicitly: identity/token, expiry, revocation/status, ownership and requested operation as applicable.
4. Return generic public errors; do not leak environment details.
5. Do not log sensitive payloads simply because code executes on the server.

## RLS

RLS is part of the application's authorization model, not an optional database optimization.

- New tables containing user/agency/client data require an explicit RLS decision.
- Policies should follow the existing agency/agent ownership model rather than introduce one-off exceptions.
- Avoid recursive policies and implicit cross-table access loops.
- UI filtering is not a substitute for RLS.

## Sensitive client data

Avoid embedding real client names, emails, policy identifiers, SSNs, health data or authentication artifacts in fixtures, source comments, committed debug scripts and screenshots.

Test helpers should use synthetic data unless the test is intentionally run in a controlled local environment and the values remain uncommitted.

## Carrier automation

Carrier portal credentials and browser sessions are server/worker concerns only.

- Never deliver credentials or cookies to the CRM browser bundle.
- Do not log passwords, MFA secrets, access tokens or complete session storage.
- Persist only the normalized business data required by the CRM.
- Failed/partial runs must not replace the last known successful snapshot.
- Reauthentication must be explicit and observable rather than silently retrying with stale credentials indefinitely.

## Temporary administrative scripts

One-off scripts that use service-role access, generate login links, inspect production data or directly mutate schema belong in ignored local scratch space. They must not be committed.

The 2026-08-27 audit identified historically committed `scratch/` utilities of this class. They are removed from the cleanup branch, but their presence in Git history means any secret ever embedded in historical files would still require rotation. No hardcoded service-role key was observed in the inspected example; it read the value from `.env.local`.

## Before merge

Review every change for:

- unexpected `.env`/credential files
- new `NEXT_PUBLIC_` variables that should be server-only
- service-role access
- disabled RLS or authorization checks
- hardcoded real-person data
- console output containing sensitive values
- new external dependencies
- broad database migrations or destructive SQL

Security-relevant refactors should be small enough to review. Do not combine them with unrelated feature work.
