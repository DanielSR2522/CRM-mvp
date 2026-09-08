import { NextResponse } from 'next/server';
import { getDeliveryProvider } from '@/lib/marketing/delivery-provider';

export async function GET() {
  const { isLive } = getDeliveryProvider();
  const liveSendEnv = process.env.MARKETING_EMAIL_LIVE_SEND;
  const isLiveConfigured = liveSendEnv === 'true' || liveSendEnv === '1';
  const apiKeyConfigured = Boolean(process.env.RESEND_API_KEY);

  return NextResponse.json({
    isLive,
    liveSendEnv: isLiveConfigured,
    apiKeyConfigured,
    mode: isLive ? 'LIVE_RESEND_DELIVERY' : 'SAFE_MOCK_MODE',
    fromEmail: process.env.RESEND_FROM_EMAIL || 'consents@mail.smartrackcrm.com',
  });
}
