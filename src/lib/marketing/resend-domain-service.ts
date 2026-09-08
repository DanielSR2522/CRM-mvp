import { VerifiedSendingIdentity, DomainAuthStatus } from '@/types/marketing';

export interface ResendDomainItem {
  id: string;
  name: string;
  status: 'verified' | 'unverified' | 'pending';
  created_at: string;
  records?: Array<{
    record: string;
    name: string;
    type: string;
    status: string;
    value: string;
  }>;
}

export async function fetchResendDomains(): Promise<{
  domains: ResendDomainItem[];
  verifiedIdentities: VerifiedSendingIdentity[];
}> {
  const apiKey = process.env.RESEND_API_KEY;
  const defaultFromEmail = process.env.RESEND_FROM_EMAIL || 'consents@mail.smartrackcrm.com';

  const defaultIdentity: VerifiedSendingIdentity = {
    id: 'resend-default-identity',
    name: 'SmarTrack Marketing System',
    fromAddress: defaultFromEmail,
    replyToAddress: 'agent@smartrack.com',
    domain: defaultFromEmail.split('@')[1] || 'mail.smartrackcrm.com',
    domainStatus: 'VERIFIED',
    isEligibleForFrom: true,
  };

  if (!apiKey) {
    return {
      domains: [],
      verifiedIdentities: [defaultIdentity],
    };
  }

  try {
    const res = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      console.warn('Resend domains API response:', res.status);
      return { domains: [], verifiedIdentities: [defaultIdentity] };
    }

    const data = await res.json();
    const domainList: ResendDomainItem[] = data.data || [];

    const verifiedIdentities: VerifiedSendingIdentity[] = [defaultIdentity];

    domainList.forEach((d) => {
      const status: DomainAuthStatus = d.status === 'verified' ? 'VERIFIED' : 'FAILED';
      verifiedIdentities.push({
        id: d.id,
        name: `Agency Domain (${d.name})`,
        fromAddress: `marketing@${d.name}`,
        replyToAddress: 'agent@smartrack.com',
        domain: d.name,
        domainStatus: status,
        isEligibleForFrom: d.status === 'verified',
      });
    });

    return { domains: domainList, verifiedIdentities };
  } catch (err: any) {
    console.warn('Failed to fetch Resend domains:', err?.message);
    return { domains: [], verifiedIdentities: [defaultIdentity] };
  }
}
