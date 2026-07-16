# Rollback Guide — Electronic Signatures Module

Undo procedure for `migration_electronic_signatures.sql` (Phase 2).

**Nothing in this document is executed automatically.** Everything here is a manual procedure to be run by the project owner, in the Supabase SQL Editor, after reading the warning below.

---

## ⚠️ Read this before running anything

**Rolling back destroys legal evidence.**

The tables created by this migration hold the only record of:

- what a client actually saw when they signed;
- the fact that they accepted the electronic-signature consent, and the exact wording they accepted;
- when they signed, from which IP, with which browser;
- the SHA-256 hashes that make the signed document tamper-evident.

Dropping `signature_events`, `signature_request_signers` or `signature_files` deletes that record permanently. Postgres will not warn you and there is no undo.

**A rollback is only safe when at least one of these is true:**

- the module was installed but never used in production (no rows in `signature_requests`), or
- you have taken and verified a full backup of the seven tables *and* the two Storage buckets, and you have confirmed you can restore it.

**Check whether real evidence exists — always run this first:**

```sql
SELECT
    (SELECT count(*) FROM public.signature_requests)                                    AS requests_total,
    (SELECT count(*) FROM public.signature_requests WHERE status = 'signed')            AS requests_signed,
    (SELECT count(*) FROM public.signature_events)                                      AS audit_events,
    (SELECT count(*) FROM public.signature_files
      WHERE file_type IN ('signed_document', 'audit_certificate'))                      AS evidence_files;
```

If `requests_signed`, `audit_events` or `evidence_files` is greater than zero, **stop** and back up first (see [Backup before rollback](#backup-before-rollback)). Do not proceed on the assumption that the data can be regenerated. It cannot.

Note that the migration's own guards will fight you: `signature_files_guard_delete()` raises on any attempt to delete a `signed_document` or `audit_certificate` row, and `signature_requests_guard_delete()` raises on any request that is not a draft. This is intentional. `DROP TABLE` bypasses row-level triggers, which is precisely why the drop order below is dangerous and why the backup step is not optional.

---

## Scope

This rollback removes **only** objects created by `migration_electronic_signatures.sql`.

It does not touch, and must never be extended to touch:

- `clients`, `policies`, `profiles`, `activity_events`
- `policy_documents`, `policy_document_sections`, `policy_notes`, `policy_note_attachments`
- the `policy-documents` bucket or any of its four `policy_documents_storage_*` policies

Every object below is namespaced (`consent_*`, `signature_*`, `consents_*`), so the drop statements cannot collide with pre-existing objects.

---

## Backup before rollback

### What this backup is, and what it is not

The `CREATE TABLE ... AS SELECT ...` snippet below is an **emergency data dump, not a structural backup.** It copies the current rows and columns and nothing else. It does **not** preserve:

- primary keys
- foreign keys
- unique constraints
- CHECK constraints
- indexes
- triggers
- comments
- RLS (the copies are created with row level security disabled)
- policies
- column defaults
- identity/generated behavior

Restoring from these copies gives you back the *values*, but none of the guarantees that make those values trustworthy: no `token_hash` uniqueness, no append-only trigger on the audit trail, no immutability guard on signed evidence, no ownership policies. A restored `signature_events` table without `signature_events_block_update_trg` is a table anyone can rewrite — which is the opposite of an audit trail.

So treat this snippet as the floor, not the plan. A rollback you can actually reverse requires **all** of the following, kept together:

1. **`migration_electronic_signatures.sql` itself** — this is what rebuilds the structure. The data dump is worthless without it.
2. **The SHA-256 of every file you are relying on** (the migration and this guide), recorded outside the repo, so you can prove later that what you restore is what you backed up. Compute with `sha256sum <file>` or `Get-FileHash <file> -Algorithm SHA256`.
3. **A full database backup** whenever the plan offers one (Supabase Dashboard → Database → Backups). This is the only artifact that restores structure and data together, and it should be your primary path.
4. **A verified copy of both Storage buckets** — verified meaning you opened the downloaded files and confirmed they are readable, not merely that the download finished. See the Storage note below.

### The data dump

Run in the Supabase SQL Editor. This creates plain copies in a separate schema; it does not modify the originals.

```sql
CREATE SCHEMA IF NOT EXISTS signatures_backup;

CREATE TABLE signatures_backup.consent_templates          AS SELECT * FROM public.consent_templates;
CREATE TABLE signatures_backup.consent_template_versions  AS SELECT * FROM public.consent_template_versions;
CREATE TABLE signatures_backup.signature_requests         AS SELECT * FROM public.signature_requests;
CREATE TABLE signatures_backup.signature_request_signers  AS SELECT * FROM public.signature_request_signers;
CREATE TABLE signatures_backup.signature_events           AS SELECT * FROM public.signature_events;
CREATE TABLE signatures_backup.signature_delivery_attempts AS SELECT * FROM public.signature_delivery_attempts;
CREATE TABLE signatures_backup.signature_files            AS SELECT * FROM public.signature_files;
```

Verify the copies match before going further:

```sql
SELECT 'signature_requests' AS t,
       (SELECT count(*) FROM public.signature_requests)            AS live,
       (SELECT count(*) FROM signatures_backup.signature_requests) AS backup
UNION ALL
SELECT 'signature_events',
       (SELECT count(*) FROM public.signature_events),
       (SELECT count(*) FROM signatures_backup.signature_events)
UNION ALL
SELECT 'signature_files',
       (SELECT count(*) FROM public.signature_files),
       (SELECT count(*) FROM signatures_backup.signature_files);
```

**Storage objects are not covered by the SQL backup above.** The rows in `signature_files` are only metadata — the actual signature bitmaps and signed PDFs live in the `signatures` and `signed-documents` buckets. Download them separately (Supabase Dashboard → Storage → select bucket → download) **before** step 2 of the rollback. Once the bucket rows are deleted, the objects are gone.

Take a full database backup as well (Supabase Dashboard → Database → Backups) if the project has anything beyond test data.

---

## Rollback order

The order matters: dependencies come down before the things they depend on. Run each step and confirm it succeeds before starting the next.

### Step 1 — Storage policies

```sql
DROP POLICY IF EXISTS "signatures_storage_select"       ON storage.objects;
DROP POLICY IF EXISTS "signed_documents_storage_select" ON storage.objects;
```

Do **not** touch `policy_documents_storage_select`, `policy_documents_storage_insert`, `policy_documents_storage_update` or `policy_documents_storage_delete` — those belong to the pre-existing documents module.

### Step 2 — Storage objects and buckets

⚠️ **This is the destructive, irreversible step.** Signed PDFs and signature images are deleted here.

A bucket cannot be dropped while it still holds objects, so the objects go first. Do it in this order:

#### 2.1 — Download and verify everything first

Supabase Dashboard → Storage → `signatures`, then `signed-documents` → download.

Verify means **open the files**: a signed PDF that renders, a signature PNG that displays. A finished download is not a verified backup. Once step 2.3 runs, there is nothing to re-download.

#### 2.2 — Enumerate what is about to be destroyed

Read-only. Run this and keep the output — it is your checklist for step 2.4.

```sql
-- Count per bucket:
SELECT bucket_id, count(*) AS objects, pg_size_pretty(sum((metadata->>'size')::bigint)) AS total_size
FROM storage.objects
WHERE bucket_id IN ('signatures', 'signed-documents')
GROUP BY bucket_id;

-- Full inventory:
SELECT bucket_id, name, created_at
FROM storage.objects
WHERE bucket_id IN ('signatures', 'signed-documents')
ORDER BY bucket_id, name;

-- Cross-check against our metadata table — these counts should reconcile:
SELECT storage_bucket, file_type, count(*)
FROM public.signature_files
GROUP BY storage_bucket, file_type
ORDER BY storage_bucket, file_type;
```

#### 2.3 — Delete the objects through the Storage layer

**Use the Storage API or the Dashboard, not raw SQL.** Supabase Dashboard → Storage → select bucket → select all → Delete. Deleting through the Storage layer is what actually removes the underlying object; it is the only path this project should use.

Programmatic equivalent, if you prefer it (run server-side, with the service role, never from a browser):

```js
// List then remove, per bucket. Paginate if you have more than 1000 objects.
const { data: files } = await supabaseAdmin.storage.from('signatures').list('', { limit: 1000 })
await supabaseAdmin.storage.from('signatures').remove(files.map(f => f.name))
```

Note the `.list('')` call above only returns the top level; these buckets are nested (`{agent_id}/{client_id}/{request_id}/...`), so a real script must walk the prefixes recursively. Use the inventory from step 2.2 as the authoritative path list.

> **Emergency fallback only — not the first option.**
> If the Storage layer is unavailable and you have no other route, the metadata rows can be deleted directly:
>
> ```sql
> DELETE FROM storage.objects WHERE bucket_id = 'signatures';
> DELETE FROM storage.objects WHERE bucket_id = 'signed-documents';
> ```
>
> Understand what this does and does not do. `storage.objects` is the **metadata** table. Deleting a row here removes Storage's record of the file; depending on the Storage backend and version, the underlying object may survive as an orphan that no longer appears in any listing, still consumes quota, and cannot be cleaned up through the normal interface. It is a metadata edit that *looks* like a deletion. Prefer step 2.3 in every case where it is possible.
>
> **Never run `DELETE FROM storage.objects` without an exact `bucket_id` filter.** An unfiltered delete takes `policy-documents` with it — every client document the agency has ever uploaded.

#### 2.4 — Confirm both buckets are empty

```sql
SELECT bucket_id, count(*) AS remaining
FROM storage.objects
WHERE bucket_id IN ('signatures', 'signed-documents')
GROUP BY bucket_id;
-- expected: 0 rows (or remaining = 0)
```

Do not continue to 2.5 while anything remains. Dropping a bucket that still holds objects is exactly how orphans are created.

#### 2.5 — Only now, delete the buckets

```sql
DELETE FROM storage.buckets WHERE id = 'signatures';
DELETE FROM storage.buckets WHERE id = 'signed-documents';
```

The Dashboard's "Delete bucket" button does the same thing and is equally acceptable. `policy-documents` is never touched.

### Step 3 — RLS policies

Dropping the tables would drop these automatically, but doing it explicitly keeps the rollback auditable and lets you stop here if you only want to disable access without losing data.

```sql
-- consent_templates
DROP POLICY IF EXISTS "Agents can select their own consent templates"        ON public.consent_templates;
DROP POLICY IF EXISTS "Agents can insert their own consent templates"        ON public.consent_templates;
DROP POLICY IF EXISTS "Agents can update their own consent templates"        ON public.consent_templates;
DROP POLICY IF EXISTS "Agents can delete their own unused draft templates"   ON public.consent_templates;

-- consent_template_versions
DROP POLICY IF EXISTS "Agents can select versions of their templates"            ON public.consent_template_versions;
DROP POLICY IF EXISTS "Agents can insert versions for their templates"           ON public.consent_template_versions;
DROP POLICY IF EXISTS "Agents can update unused versions of their templates"     ON public.consent_template_versions;
DROP POLICY IF EXISTS "Agents can delete unused versions of their templates"     ON public.consent_template_versions;

-- signature_requests
DROP POLICY IF EXISTS "Agents can select requests of their clients"        ON public.signature_requests;
DROP POLICY IF EXISTS "Agents can insert requests for their clients"       ON public.signature_requests;
DROP POLICY IF EXISTS "Agents can update requests of their clients"        ON public.signature_requests;
DROP POLICY IF EXISTS "Agents can delete draft requests of their clients"  ON public.signature_requests;

-- signature_request_signers
DROP POLICY IF EXISTS "Agents can select signers of their requests"          ON public.signature_request_signers;
DROP POLICY IF EXISTS "Agents can insert signers for their requests"         ON public.signature_request_signers;
DROP POLICY IF EXISTS "Agents can update signers of their requests"          ON public.signature_request_signers;
DROP POLICY IF EXISTS "Agents can delete signers of their draft requests"    ON public.signature_request_signers;

-- signature_events
DROP POLICY IF EXISTS "Agents can select events of their requests"   ON public.signature_events;
DROP POLICY IF EXISTS "Agents can insert events for their requests"  ON public.signature_events;

-- signature_delivery_attempts
DROP POLICY IF EXISTS "Agents can select delivery attempts of their requests"   ON public.signature_delivery_attempts;
DROP POLICY IF EXISTS "Agents can insert delivery attempts for their requests"  ON public.signature_delivery_attempts;
DROP POLICY IF EXISTS "Agents can update delivery attempts of their requests"   ON public.signature_delivery_attempts;

-- signature_files
DROP POLICY IF EXISTS "Agents can select files of their requests"                  ON public.signature_files;
DROP POLICY IF EXISTS "Agents can insert files for their requests"                 ON public.signature_files;
DROP POLICY IF EXISTS "Agents can delete non evidence files of their requests"     ON public.signature_files;
```

### Step 4 — Triggers

```sql
DROP TRIGGER IF EXISTS consent_templates_set_updated_at_trg          ON public.consent_templates;
DROP TRIGGER IF EXISTS consent_template_versions_guard_frozen_trg    ON public.consent_template_versions;
DROP TRIGGER IF EXISTS signature_requests_validate_relations_trg     ON public.signature_requests;
DROP TRIGGER IF EXISTS signature_requests_guard_transitions_trg      ON public.signature_requests;
DROP TRIGGER IF EXISTS signature_requests_guard_delete_trg           ON public.signature_requests;
DROP TRIGGER IF EXISTS signature_requests_set_updated_at_trg         ON public.signature_requests;
DROP TRIGGER IF EXISTS signature_request_signers_guard_signing_trg   ON public.signature_request_signers;
DROP TRIGGER IF EXISTS signature_events_block_update_trg             ON public.signature_events;
DROP TRIGGER IF EXISTS signature_files_guard_delete_trg              ON public.signature_files;
```

### Step 5 — Tables (children before parents)

The FK graph is:

```
consent_templates
  └── consent_template_versions
        └── signature_requests ── clients (existing, RESTRICT — not dropped)
              │                └─ policies (existing, SET NULL — not dropped)
              ├── signature_request_signers
              ├── signature_events
              ├── signature_delivery_attempts
              └── signature_files
```

So the drop order is leaves first:

```sql
DROP TABLE IF EXISTS public.signature_files;
DROP TABLE IF EXISTS public.signature_delivery_attempts;
DROP TABLE IF EXISTS public.signature_events;
DROP TABLE IF EXISTS public.signature_request_signers;
DROP TABLE IF EXISTS public.signature_requests;
DROP TABLE IF EXISTS public.consent_template_versions;
DROP TABLE IF EXISTS public.consent_templates;
```

If a `DROP TABLE` fails with a dependency error, **do not reach for `CASCADE`.** Read the error, find what still references the table, and handle it deliberately. `DROP TABLE ... CASCADE` on `signature_requests` would silently take every child table with it, including the audit trail — exactly the outcome this guide exists to prevent.

Note that `clients` and `policies` are never dropped; the FKs pointing *at* them disappear along with our tables.

### Step 6 — Functions

Drop last: the triggers that used them are already gone.

```sql
DROP FUNCTION IF EXISTS public.signature_files_guard_delete();
DROP FUNCTION IF EXISTS public.signature_events_block_update();
DROP FUNCTION IF EXISTS public.signature_request_signers_guard_signing();
DROP FUNCTION IF EXISTS public.signature_requests_guard_delete();
DROP FUNCTION IF EXISTS public.signature_requests_guard_transitions();
DROP FUNCTION IF EXISTS public.signature_requests_validate_relations();
DROP FUNCTION IF EXISTS public.consent_template_versions_guard_frozen();
DROP FUNCTION IF EXISTS public.consents_set_updated_at();
```

`consents_set_updated_at()` is deliberately module-namespaced rather than a generic `set_updated_at()`, precisely so this line cannot break an unrelated table.

---

## Verification after rollback

All four queries should return zero rows.

```sql
-- No module tables remain:
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('consent_templates','consent_template_versions','signature_requests',
                    'signature_request_signers','signature_events',
                    'signature_delivery_attempts','signature_files');

-- No module policies remain:
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE ANY (ARRAY['consent_%','signature_%']);

-- No module functions remain:
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND (proname LIKE 'consent%' OR proname LIKE 'signature%');

-- No module buckets remain:
SELECT id FROM storage.buckets WHERE id IN ('signatures','signed-documents');
```

And confirm the pre-existing module is intact — these **must** still return rows:

```sql
SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'policy-documents';

SELECT policyname FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'policy_documents_storage_%';
-- expected: 4 rows

SELECT count(*) FROM public.policy_documents;
SELECT count(*) FROM public.activity_events;
```

---

## Partial rollbacks

You usually do not need the full teardown.

**To disable the module without losing data** — stop at Step 3 (drop the RLS policies). With RLS enabled and no policies, the rows stay on disk and become unreachable **for normal application traffic only**. Reinstate by re-running the migration, which recreates the policies idempotently.

Be precise about what "disabled" means here, because it is not "invisible to everyone":

- **`authenticated` users** (agents using the CRM in a browser) are blocked. RLS enabled with zero applicable policies denies every operation. This is the case the CRM actually runs as.
- **`anon`** is blocked, for the same reason.
- **`SUPABASE_SERVICE_ROLE_KEY` still bypasses RLS entirely.** Dropping policies does nothing to it. Any server route holding that key keeps full read/write access to all seven tables.
- **Postgres owner and administrative roles keep access too** — table owners bypass RLS unless `FORCE ROW LEVEL SECURITY` is set, and superusers bypass it unconditionally. The SQL Editor and direct database connections fall in this category.

So dropping policies takes the module away from the UI, not out of service. To take it genuinely out of service you must **also disable the server-side entry points**: remove or short-circuit the API routes under `src/app/api/` that use the service role, and the public `/sign/[token]` page. As of Phase 2 none of those exist yet, so dropping the policies is currently sufficient — but this stops being true the moment the service-role key is introduced in a later phase.

**To take the UI offline without touching the database at all** — revert the application-side changes only. As of Phase 2 there are none: this migration is the entire footprint of the module, and no existing file has been modified.

**To fix a bad policy or trigger** — do not roll back. Re-running `migration_electronic_signatures.sql` is idempotent, but note that its `DO` blocks skip policies that already exist. To change a policy, drop that single policy (Step 3) and re-run the migration. Triggers and functions are recreated unconditionally on every run.

---

## Reinstalling after a rollback

Re-run `migration_electronic_signatures.sql` as-is. The preflight block in Section 0 aborts loudly if a leftover table exists with an incompatible shape, so a half-finished rollback surfaces as a clear error rather than a silent mismatch.

If you restored from `signatures_backup`, restore the Storage objects too — the `signature_files` rows are worthless without the bytes they point at, and a `sha256_hash` with no file behind it is not evidence.
