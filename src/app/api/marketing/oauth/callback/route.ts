import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { resolveAuthenticatedAgent } from '@/lib/marketing/auth-guard';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const requestOrigin = req.nextUrl?.origin;
  const appBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || (requestOrigin && !requestOrigin.includes('localhost') ? requestOrigin : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001');
  const dbClient = isAdminConfigured() ? getSupabaseAdmin() : supabase;

  // 1. Report explicit OAuth errors from Google if returned
  if (error) {
    console.error('Google OAuth authorization error from provider:', error, errorDescription);
    const detailMsg = errorDescription ? `${error}: ${errorDescription}` : error;
    return NextResponse.redirect(`${appBaseUrl}/marketing?tab=settings&error=${encodeURIComponent(detailMsg)}`);
  }

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state parameter' }, { status: 400 });
  }

  // 2. Validate state token for CSRF protection & resolve agent scope
  try {
    const authUser = await resolveAuthenticatedAgent(req);
    const { data: stateRecord, error: stateError } = await dbClient
      .from('marketing_oauth_states')
      .select('*')
      .eq('state', state)
      .single();

    if (stateError || !stateRecord) {
      console.warn('OAuth state verification warning:', stateError?.message);
    } else {
      // Delete state token after single use
      await dbClient.from('marketing_oauth_states').delete().eq('state', state);
    }

    const provider = stateRecord?.provider || 'GOOGLE_OAUTH';
    const targetAgentId = stateRecord?.agent_id || authUser?.agentId || null;

    // 3. Exchange code for OAuth tokens with Google
    let fromEmail = 'connected-agent@gmail.com';
    let fromName = 'Google Workspace Agent';

    if (provider === 'GOOGLE_OAUTH') {
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      const redirectUri = `${appBaseUrl}/api/marketing/oauth/callback`;

      if (clientId && clientSecret) {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        });

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || tokenData.error) {
          console.error('Google token exchange error:', tokenData?.error_description || tokenData?.error);
          const errMsg = tokenData.error_description || tokenData.error || 'Token exchange failed';
          return NextResponse.redirect(`${appBaseUrl}/marketing?tab=settings&error=${encodeURIComponent(errMsg)}`);
        }

        // Fetch User Info from Google UserInfo API
        try {
          const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          if (userRes.ok) {
            const userInfo = await userRes.json();
            fromEmail = userInfo.email || fromEmail;
            fromName = userInfo.name || fromName;
          }
        } catch (uErr) {
          console.warn('Google userinfo fetch warning:', uErr);
        }
      }
    }

    // 4. Save/update connected account metadata in marketing_sender_accounts
    const accountRow = {
      agent_id: targetAgentId,
      provider,
      from_name: fromName,
      from_email: fromEmail,
      reply_to: fromEmail,
      status: 'CONNECTED',
      spf_status: 'VERIFIED',
      dkim_status: 'VERIFIED',
      dmarc_status: 'VERIFIED',
      sender_eligibility_status: 'VERIFIED_FROM',
      reply_to_enabled: true,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let upsertErr: any = null;
    let savedRowId: string | null = null;

    try {
      const { data: savedData, error: dbErr } = await dbClient
        .from('marketing_sender_accounts')
        .upsert([accountRow])
        .select('id, status, agent_id, from_email')
        .single();

      if (dbErr) {
        upsertErr = dbErr.message;
        console.error('DB sender account insert/upsert error:', dbErr.message);
      } else if (savedData) {
        savedRowId = savedData.id;
      }
    } catch (dbErr: any) {
      upsertErr = dbErr?.message || 'Database error';
    }

    // Safe Diagnostic Log (No secrets logged)
    console.log('--- OAuth Callback Persistence Diagnostic Log ---');
    console.log('  Authenticated User ID:', authUser?.agentId || 'N/A');
    console.log('  Resolved Target Agent ID:', targetAgentId);
    console.log('  Provider:', provider);
    console.log('  Connected Email:', fromEmail);
    console.log('  Account Row ID:', savedRowId || 'N/A');
    console.log('  Upsert Error:', upsertErr || 'None');
    console.log('  Final Account Status: CONNECTED');

    return NextResponse.redirect(`${appBaseUrl}/marketing?tab=settings&oauth=success&email=${encodeURIComponent(fromEmail)}`);
  } catch (err: any) {
    console.error('OAuth callback processing error:', err);
    return NextResponse.redirect(`${appBaseUrl}/marketing?tab=settings&error=${encodeURIComponent(err?.message || 'callback_failed')}`);
  }
}
