import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { resolveAuthenticatedAgent } from '@/lib/marketing/auth-guard';

export async function GET(req: NextRequest) {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const appBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

  if (!clientId) {
    return NextResponse.json(
      {
        status: 'SETUP_REQUIRED',
        message: 'Microsoft 365 OAuth Client ID is not configured in environment variables (MICROSOFT_OAUTH_CLIENT_ID). Direct password prompts are disabled for security.',
        instructions: 'Add MICROSOFT_OAUTH_CLIENT_ID and MICROSOFT_OAUTH_CLIENT_SECRET to .env.local to enable Microsoft 365 OAuth 2.0 authorization.',
      },
      { status: 501 }
    );
  }

  const authUser = await resolveAuthenticatedAgent(req);
  if (!authUser?.agentId) {
    return NextResponse.json(
      { error: '401 Unauthorized: Server-side agent authentication required to initiate Microsoft OAuth flow.' },
      { status: 401 }
    );
  }
  const agentId = authUser.agentId;

  const stateToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const dbClient = isAdminConfigured() ? getSupabaseAdmin() : supabase;

  try {
    await dbClient.from('marketing_oauth_states').insert([
      {
        state: stateToken,
        provider: 'MICROSOFT_OAUTH',
        agent_id: agentId,
        expires_at: expiresAt,
      },
    ]);
  } catch (err) {
    console.warn('OAuth state storage warning:', err);
  }

  const redirectUri = `${appBaseUrl}/api/marketing/oauth/callback`;
  const scopes = encodeURIComponent('openid profile email offline_access User.Read');

  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_mode=query&scope=${scopes}&state=${stateToken}`;

  const formatParam = req.nextUrl.searchParams.get('format');
  const acceptHeader = req.headers.get('accept') || '';

  if (formatParam === 'json' || acceptHeader.includes('application/json')) {
    return NextResponse.json({
      success: true,
      url: authUrl,
      provider: 'MICROSOFT_OAUTH',
      redirectUri,
    });
  }

  return NextResponse.redirect(authUrl);
}
