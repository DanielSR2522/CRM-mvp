import { SafetyCheckSummary } from '@/types/marketing';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export interface RawRecipientCandidate {
  email: string;
  name: string;
  clientId?: string;
  leadId?: string;
  hasMarketingConsent?: boolean;
  carrier?: string;
  policyStatus?: string;
  state?: string;
  assignedAgent?: string;
  expirationDate?: string;
}

export function evaluateRecipientSafety(
  candidates: RawRecipientCandidate[],
  suppressedEmails: Set<string> = new Set(),
  hardBouncedEmails: Set<string> = new Set()
): SafetyCheckSummary {
  const seenEmails = new Set<string>();
  const details: SafetyCheckSummary['details'] = [];

  let totalMatched = candidates.length;
  let validRecipients = 0;
  let excludedDuplicates = 0;
  let excludedInvalidEmail = 0;
  let excludedUnsubscribed = 0;
  let excludedBounced = 0;
  let excludedNoConsent = 0;

  candidates.forEach((cand) => {
    const rawEmail = (cand.email || '').trim().toLowerCase();
    const commonFields = {
      email: cand.email || 'N/A',
      name: cand.name,
      clientId: cand.clientId,
      leadId: cand.leadId,
      carrier: cand.carrier || 'Ambetter',
      policyStatus: cand.policyStatus || 'Active',
      state: cand.state || 'FL',
      assignedAgent: cand.assignedAgent || 'Damaris',
      expirationDate: cand.expirationDate || '2026-12-31',
    };

    // 1. Empty or malformed email
    if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
      excludedInvalidEmail++;
      details.push({
        ...commonFields,
        isExcluded: true,
        reason: 'Invalid or missing email address',
      });
      return;
    }

    // 2. Duplicate email
    if (seenEmails.has(rawEmail)) {
      excludedDuplicates++;
      details.push({
        ...commonFields,
        email: rawEmail,
        isExcluded: true,
        reason: 'Duplicate recipient email',
      });
      return;
    }

    // 3. Hard bounced email
    if (hardBouncedEmails.has(rawEmail)) {
      excludedBounced++;
      details.push({
        ...commonFields,
        email: rawEmail,
        isExcluded: true,
        reason: 'Previous hard bounce',
      });
      return;
    }

    // 4. Unsubscribed / Suppressed
    if (suppressedEmails.has(rawEmail)) {
      excludedUnsubscribed++;
      details.push({
        ...commonFields,
        email: rawEmail,
        isExcluded: true,
        reason: 'Unsubscribed or suppressed',
      });
      return;
    }

    // 5. Consent requirement
    if (cand.hasMarketingConsent === false) {
      excludedNoConsent++;
      details.push({
        ...commonFields,
        email: rawEmail,
        isExcluded: true,
        reason: 'No active marketing consent',
      });
      return;
    }

    // Valid recipient
    seenEmails.add(rawEmail);
    validRecipients++;
    details.push({
      ...commonFields,
      email: rawEmail,
      isExcluded: false,
    });
  });

  return {
    totalMatched,
    validRecipients,
    excludedDuplicates,
    excludedInvalidEmail,
    excludedUnsubscribed,
    excludedBounced,
    excludedNoConsent,
    details,
  };
}
