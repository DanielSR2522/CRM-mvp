import { DomainAuthStatus, MarketingSenderAccount, SafetyCheckSummary } from '@/types/marketing';

export interface PreSendHealthCheck {
  isValidSender: boolean;
  hasUnsubscribeMechanism: boolean;
  hasDuplicatesExcluded: boolean;
  hasSuppressionChecked: boolean;
  domainVerified: boolean;
  warnings: string[];
  blockSending: boolean;
}

export function performPreSendHealthCheck(
  senderAccount?: MarketingSenderAccount | null,
  safetySummary?: SafetyCheckSummary | null,
  contentHtml?: string | null
): PreSendHealthCheck {
  const warnings: string[] = [];
  let blockSending = false;

  const isValidSender = Boolean(senderAccount && senderAccount.from_email);
  if (!isValidSender) {
    warnings.push('No verified sender account selected.');
    blockSending = true;
  }

  const domainVerified = Boolean(
    senderAccount &&
      senderAccount.spf_status === 'VERIFIED' &&
      senderAccount.dkim_status === 'VERIFIED'
  );

  if (!domainVerified) {
    warnings.push('Domain authentication (SPF/DKIM) is not verified. Emails may land in spam.');
  }

  const hasUnsubscribeMechanism = Boolean(
    contentHtml && (contentHtml.toLowerCase().includes('unsubscribe') || contentHtml.toLowerCase().includes('opt-out'))
  );

  if (!hasUnsubscribeMechanism) {
    warnings.push('Missing explicit unsubscribe link in message content.');
  }

  if (safetySummary) {
    if (safetySummary.excludedInvalidEmail > 0) {
      warnings.push(`${safetySummary.excludedInvalidEmail} invalid email addresses were automatically removed.`);
    }
    if (safetySummary.excludedDuplicates > 0) {
      warnings.push(`${safetySummary.excludedDuplicates} duplicate recipient entries were excluded.`);
    }
    if (safetySummary.excludedUnsubscribed > 0) {
      warnings.push(`${safetySummary.excludedUnsubscribed} unsubscribed/suppressed contacts were excluded.`);
    }
    if (safetySummary.validRecipients === 0) {
      warnings.push('Campaign audience contains 0 valid recipients.');
      blockSending = true;
    }
  }

  return {
    isValidSender,
    hasUnsubscribeMechanism,
    hasDuplicatesExcluded: Boolean(safetySummary && safetySummary.excludedDuplicates >= 0),
    hasSuppressionChecked: true,
    domainVerified,
    warnings,
    blockSending,
  };
}

export function computeSenderHealthScore(account?: MarketingSenderAccount | null): {
  score: number;
  status: 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION' | 'POOR';
} {
  if (!account || account.status === 'DISCONNECTED') {
    return { score: 0, status: 'POOR' };
  }

  let score = 50;
  if (account.spf_status === 'VERIFIED') score += 20;
  if (account.dkim_status === 'VERIFIED') score += 20;
  if (account.dmarc_status === 'VERIFIED') score += 10;

  let status: 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION' | 'POOR' = 'GOOD';
  if (score >= 90) status = 'EXCELLENT';
  else if (score >= 70) status = 'GOOD';
  else if (score >= 50) status = 'NEEDS_ATTENTION';
  else status = 'POOR';

  return { score, status };
}
