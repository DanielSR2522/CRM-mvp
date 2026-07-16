/**
 * Delivery readiness — one switch, one reason.
 *
 * Every channel needs a signing link, and links cannot be issued until
 * migration_signatures_token_reissue.sql is applied: the current
 * signature_request_signers_guard_signing() trigger refuses any token_hash
 * rotation, so there is no way to mint a usable token for a request.
 *
 * Rather than let each adapter fail somewhere deep with a Postgres exception,
 * they all ask here first and report the same honest sentence. When the migration
 * lands, flip LINK_ISSUANCE_ENABLED and every channel comes alive at once.
 */

import type { ReadinessResult } from './types';

/**
 * True once migration_signatures_token_reissue.sql has been applied to the
 * database this build talks to.
 *
 * A constant rather than an env var on purpose: it is not a deployment choice,
 * it is a statement about whether the schema supports the feature.
 *
 * Applied on 2026-07-16. If this code is ever pointed at a database that predates
 * that migration, link issuance will fail loudly at the trigger rather than
 * silently — which is the correct failure, not something to guard against here.
 */
export const LINK_ISSUANCE_ENABLED = true;

export const LINK_ISSUANCE_BLOCKED_REASON =
  'Signing links cannot be issued against this database: it still has the original write-once token rule. Apply migration_signatures_token_reissue.sql.';

export function linkIssuanceReady(): ReadinessResult {
  return LINK_ISSUANCE_ENABLED
    ? { ready: true }
    : { ready: false, reason: LINK_ISSUANCE_BLOCKED_REASON };
}
