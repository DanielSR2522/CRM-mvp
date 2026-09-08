import crypto from 'crypto';
import { supabase } from '@/lib/supabaseClient';
import { addSuppression } from './marketing-service';

const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'marketing_unsub_secret_key_2026';

export interface UnsubscribePayload {
  email: string;
  campaignId?: string;
  recipientId?: string;
}

/**
 * Generates an opaque signed HMAC token for unsubscribe URLs.
 * Encodes payload into base64url with signature verification to prevent tampering.
 */
export function generateUnsubscribeToken(payload: UnsubscribePayload): string {
  const data = JSON.stringify({
    e: payload.email.trim().toLowerCase(),
    c: payload.campaignId || '',
    r: payload.recipientId || '',
    t: Date.now(),
  });

  const encodedData = Buffer.from(data).toString('base64url');
  const hmac = crypto.createHmac('sha256', UNSUBSCRIBE_SECRET);
  hmac.update(encodedData);
  const signature = hmac.digest('base64url');

  return `${encodedData}.${signature}`;
}

/**
 * Verifies and parses an opaque signed unsubscribe token.
 */
export function verifyUnsubscribeToken(token: string): UnsubscribePayload | null {
  try {
    if (!token || !token.includes('.')) return null;

    const [encodedData, signature] = token.split('.');
    const hmac = crypto.createHmac('sha256', UNSUBSCRIBE_SECRET);
    hmac.update(encodedData);
    const expectedSignature = hmac.digest('base64url');

    if (signature !== expectedSignature) {
      console.warn('Invalid unsubscribe token signature');
      return null;
    }

    const decodedStr = Buffer.from(encodedData, 'base64url').toString('utf8');
    const parsed = JSON.parse(decodedStr);

    return {
      email: parsed.e,
      campaignId: parsed.c || undefined,
      recipientId: parsed.r || undefined,
    };
  } catch (err) {
    console.error('Error verifying unsubscribe token:', err);
    return null;
  }
}

/**
 * Process unsubscribe: records suppression in marketing_suppressions and logs audit event.
 */
export async function processUnsubscribeRequest(token: string): Promise<{ success: boolean; email?: string; message: string }> {
  const payload = verifyUnsubscribeToken(token);

  if (!payload || !payload.email) {
    return { success: false, message: 'Invalid or expired unsubscribe link.' };
  }

  const cleanEmail = payload.email.trim().toLowerCase();

  try {
    // 1. Add to global suppressions table
    await addSuppression(
      cleanEmail,
      'UNSUBSCRIBE',
      payload.campaignId ? `Opt-out from campaign ${payload.campaignId}` : 'User opted out via unsubscribe link'
    );

    // 2. Record delivery event if campaign context exists
    if (payload.campaignId) {
      await supabase.from('marketing_delivery_events').insert([
        {
          campaign_id: payload.campaignId,
          event_type: 'UNSUBSCRIBED',
          metadata: { email: cleanEmail, recipient_id: payload.recipientId },
        },
      ]);
    }

    return {
      success: true,
      email: cleanEmail,
      message: `You have been successfully unsubscribed (${cleanEmail}).`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Error processing unsubscribe request.',
    };
  }
}
