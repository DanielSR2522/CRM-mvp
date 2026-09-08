import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { resolveAuthenticatedAgent } from '@/lib/marketing/auth-guard';

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const requestOrigin = req.nextUrl?.origin;
  const appBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || (requestOrigin && !requestOrigin.includes('localhost') ? requestOrigin : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001');

  if (!clientId) {
    return NextResponse.json(
      {
        status: 'SETUP_REQUIRED',
        message: 'Google OAuth Client ID is not configured in environment variables (GOOGLE_OAUTH_CLIENT_ID). Direct password prompts are disabled for security.',
        instructions: 'Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to .env.local to enable Google OAuth 2.0 authorization.',
      },
      { status: 501 }
    );
  }

  // Resolve current authenticated agent identity
  const authUser = await resolveAuthenticatedAgent(req);
  if (!authUser?.agentId) {
    return NextResponse.json(
      { error: '401 Unauthorized: Server-side agent authentication required to initiate Google OAuth flow.' },
      { status: 401 }
    );
  }
  const agentId = authUser.agentId;

  // Generate CSRF state token
  const stateToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const dbClient = isAdminConfigured() ? getSupabaseAdmin() : supabase;

  try {
    await dbClient.from('marketing_oauth_states').insert([
      {
        state: stateToken,
        provider: 'GOOGLE_OAUTH',
        agent_id: agentId,
        expires_at: expiresAt,
      },
    ]);
  } catch (err) {
    console.warn('OAuth state storage warning:', err);
  }

  const redirectUri = `${appBaseUrl}/api/marketing/oauth/callback`;
  const scopes = encodeURIComponent('openid profile email');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${scopes}&state=${stateToken}&access_type=offline&prompt=consent`;

  const formatParam = req.nextUrl.searchParams.get('format');
  const acceptHeader = req.headers.get('accept') || '';

  if (formatParam === 'json' || acceptHeader.includes('application/json')) {
    return NextResponse.json({
      success: true,
      url: authUrl,
      provider: 'GOOGLE_OAUTH',
      redirectUri,
    });
  }

  return NextResponse.redirect(authUrl);
}
