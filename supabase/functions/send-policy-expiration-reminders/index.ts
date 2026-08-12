import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

interface ResendPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
}

// Helper formatting date YYYY-MM-DD to MM/DD/YYYY without UTC shifting
function formatIsoToUsDate(isoDateStr: string): string {
  if (!isoDateStr) return 'N/A';
  const parts = isoDateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${m}/${d}/${y}`;
  }
  return isoDateStr;
}

// Helper masking emails for safe logging / dry-run output
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***.com';
  const [user, domain] = email.split('@');
  return `${user.charAt(0)}***@${domain}`;
}

// Helper calculating business current date in America/New_York
function getNewYorkDateString(nowDate: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(nowDate);
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  const y = parts.find((p) => p.type === 'year')?.value;
  return `${y}-${m}-${d}`;
}

// Helper adding days to a YYYY-MM-DD date string in local calendar day
function addDaysToIsoDate(isoDateStr: string, days: number): string {
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

Deno.serve(async (req: Request) => {
  try {
    // 1. CRON SECURITY & HEADER VERIFICATION (x-cron-secret)
    const cronSecret = Deno.env.get('CRON_SECRET');
    const customCronHeader = req.headers.get('x-cron-secret');
    
    // Strict x-cron-secret validation
    if (!cronSecret || customCronHeader !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized scheduled invocation. Invalid x-cron-secret.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. CHECK DRY-RUN MODE
    const url = new URL(req.url);
    let isDryRun = url.searchParams.get('dry_run') === 'true';

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body?.dry_run === true) isDryRun = true;
      } catch (_) {
        // Body reading optional
      }
    }

    // 3. ENV VARS & SUPABASE ADMIN CLIENT (SERVICE ROLE SERVER-SIDE ONLY)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('POLICY_REMINDER_FROM_EMAIL') || 'reminders@updates.smartrackcrm.com';
    const fromName = Deno.env.get('POLICY_REMINDER_FROM_NAME') || 'SmarTrack CRM Reminders';
    const appBaseUrl = Deno.env.get('APP_BASE_URL') || 'http://localhost:3000';
    const testEmailEnv = Deno.env.get('POLICY_REMINDER_TEST_EMAIL');
    const isTestMode = Boolean(testEmailEnv && testEmailEnv.trim().length > 0);

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase server configuration.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // 4. DATE CALCULATIONS (America/New_York Business Timezone for 60, 45, and 15 days)
    const nyTodayStr = getNewYorkDateString();
    const target60Str = addDaysToIsoDate(nyTodayStr, 60);
    const target45Str = addDaysToIsoDate(nyTodayStr, 45);
    const target15Str = addDaysToIsoDate(nyTodayStr, 15);

    // 5. QUERY ELIGIBLE POLICIES (status = 'Active')
    const { data: eligiblePolicies, error: polErr } = await adminSupabase
      .from('policies')
      .select(`
        id,
        client_id,
        policy_type,
        policy_number,
        company_name,
        writing_company,
        effective_date,
        expiration_date,
        status,
        clients!inner (
          id,
          agent_id,
          full_name
        )
      `)
      .eq('status', 'Active')
      .in('expiration_date', [target60Str, target45Str, target15Str]);

    if (polErr) {
      throw new Error(`Failed to query eligible policies: ${polErr.message}`);
    }

    const processedList: any[] = [];
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // 6. PROCESS EACH ELIGIBLE POLICY
    for (const pol of eligiblePolicies || []) {
      const expirationDateStr = pol.expiration_date;
      if (!expirationDateStr) continue;

      const reminderDays = expirationDateStr === target60Str
        ? 60
        : (expirationDateStr === target45Str ? 45 : 15);

      const client = pol.clients as any;
      const agentId = client?.agent_id;
      const clientName = client?.full_name || 'Client';

      if (!agentId) {
        skippedCount++;
        processedList.push({ policy_id: pol.id, status: 'skipped', reason: 'Missing agent_id' });
        continue;
      }

      // Resolve Agent Email & Name from public.profiles table first
      let agentEmail: string | null = null;
      let agentName: string = 'Agent';

      const { data: profile } = await adminSupabase
        .from('profiles')
        .select('name, email')
        .eq('id', agentId)
        .single();

      if (profile?.email) {
        agentEmail = profile.email;
        agentName = profile.name || 'Agent';
      } else {
        // Fallback using service role access to auth.users if profiles table email is null
        const { data: authUserData } = await adminSupabase.auth.admin.getUserById(agentId);
        if (authUserData?.user?.email) {
          agentEmail = authUserData.user.email;
        }
      }

      if (!agentEmail) {
        if (!isDryRun) {
          await adminSupabase.from('policy_expiration_reminders').insert({
            policy_id: pol.id,
            agent_id: agentId,
            reminder_days: reminderDays,
            policy_expiration_date: expirationDateStr,
            recipient_email: 'unknown',
            delivery_status: 'skipped',
            error_message: 'Agent verified email address not found',
          });
        }
        skippedCount++;
        processedList.push({ policy_id: pol.id, status: 'skipped', reason: 'Agent email not found' });
        continue;
      }

      // Resolve final target email address (Redirect in TEST MODE if POLICY_REMINDER_TEST_EMAIL is set)
      const targetRecipientEmail = isTestMode ? testEmailEnv!.trim() : agentEmail;

      // DRY RUN CHECK: ZERO DB SIDE EFFECTS
      if (isDryRun) {
        skippedCount++;
        processedList.push({
          policy_id: pol.id,
          reminder_days: reminderDays,
          recipient: maskEmail(targetRecipientEmail),
          original_agent_email: maskEmail(agentEmail),
          test_mode: isTestMode,
          status: 'dry_run_would_send',
          client_name: clientName,
          policy_type: pol.policy_type,
          expiration_date: formatIsoToUsDate(expirationDateStr),
        });
        continue;
      }

      // 7. CONCURRENCY RESERVATION & STALE PENDING RECOVERY
      const thirtyMinsAgoIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      // Check existing reservation for this policy + expiration_date + interval
      const { data: existingReminders } = await adminSupabase
        .from('policy_expiration_reminders')
        .select('id, delivery_status, attempted_at')
        .eq('policy_id', pol.id)
        .eq('policy_expiration_date', expirationDateStr)
        .eq('reminder_days', reminderDays)
        .in('delivery_status', ['pending', 'sent']);

      let reservationId: string | null = null;
      const sentRecord = existingReminders?.find((r) => r.delivery_status === 'sent');
      const pendingRecord = existingReminders?.find((r) => r.delivery_status === 'pending');

      if (sentRecord) {
        // Permanent block: already sent successfully
        skippedCount++;
        processedList.push({ policy_id: pol.id, status: 'skipped', reason: 'Already sent successfully' });
        continue;
      }

      if (pendingRecord) {
        // Pending record exists. Check if stale (>= 30 mins old)
        if (pendingRecord.attempted_at > thirtyMinsAgoIso) {
          // Active lock (< 30m old) -> Skip safely
          skippedCount++;
          processedList.push({ policy_id: pol.id, status: 'skipped', reason: 'Active pending reservation' });
          continue;
        } else {
          // Stale reservation (>= 30m old) -> Claim atomically
          const { data: claimedRows } = await adminSupabase
            .from('policy_expiration_reminders')
            .update({
              attempted_at: new Date().toISOString(),
              error_message: 'Claimed stale pending reservation',
            })
            .eq('id', pendingRecord.id)
            .eq('delivery_status', 'pending')
            .lte('attempted_at', thirtyMinsAgoIso)
            .select();

          if (claimedRows && claimedRows.length > 0) {
            reservationId = pendingRecord.id;
          } else {
            // Another process claimed it first
            skippedCount++;
            processedList.push({ policy_id: pol.id, status: 'skipped', reason: 'Stale reservation claimed by parallel process' });
            continue;
          }
        }
      }

      // If no reservation exists, insert new pending reservation
      if (!reservationId) {
        const { data: newReservation, error: insertErr } = await adminSupabase
          .from('policy_expiration_reminders')
          .insert({
            policy_id: pol.id,
            agent_id: agentId,
            reminder_days: reminderDays,
            policy_expiration_date: expirationDateStr,
            recipient_email: targetRecipientEmail,
            delivery_status: 'pending',
            attempted_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertErr) {
          // Code 23505 = Unique index violation
          skippedCount++;
          processedList.push({ policy_id: pol.id, status: 'skipped', reason: 'Unique constraint conflict on pending insert' });
          continue;
        }

        reservationId = newReservation.id;
      }

      // 8. CHECK RESEND API KEY
      if (!resendApiKey) {
        await adminSupabase
          .from('policy_expiration_reminders')
          .update({ delivery_status: 'failed', error_message: 'Missing RESEND_API_KEY environment variable.' })
          .eq('id', reservationId);
        failedCount++;
        processedList.push({ policy_id: pol.id, status: 'failed', reason: 'Missing RESEND_API_KEY' });
        continue;
      }

      // 9. CONSTRUCT EMAIL TEMPLATE & PAYLOAD
      const formattedEffectiveDate = formatIsoToUsDate(pol.effective_date);
      const formattedExpDate = formatIsoToUsDate(expirationDateStr);
      const policyUrl = `${appBaseUrl}/clients/${pol.client_id}/policies/${pol.id}`;
      const carrierName = pol.writing_company || pol.company_name || 'N/A';

      let baseSubject = '';
      if (reminderDays === 60) {
        baseSubject = `Policy Expiration Reminder — 60 Days — ${clientName}`;
      } else if (reminderDays === 45) {
        baseSubject = `Policy Expiration Reminder — 45 Days — ${clientName}`;
      } else {
        baseSubject = `URGENT: Policy Expiration Reminder — 15 Days — ${clientName}`;
      }

      const subject = isTestMode ? `[TEST MODE] ${baseSubject}` : baseSubject;

      const htmlBody = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
            .test-banner { background-color: #fef3c7; border: 1px solid #f59e0b; color: #92400e; font-size: 12px; font-weight: 700; padding: 10px 16px; border-radius: 8px; margin-bottom: 20px; text-align: center; }
            .header { border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
            .title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0; }
            .subtitle { font-size: 14px; color: #64748b; margin-top: 4px; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; ${reminderDays === 60 ? 'background-color: #dbeafe; color: #1e40af;' : (reminderDays === 45 ? 'background-color: #fef3c7; color: #92400e;' : 'background-color: #fee2e2; color: #991b1b;')} }
            .details { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0; }
            .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
            .row:last-child { border-bottom: none; }
            .label { font-weight: 600; color: #64748b; }
            .value { font-weight: 700; color: #0f172a; }
            .btn { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; font-weight: 700; font-size: 14px; text-decoration: none; border-radius: 10px; text-align: center; margin-top: 16px; }
            .footer { font-size: 12px; color: #94a3b8; margin-top: 32px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 16px; }
          </style>
        </head>
        <body>
          <div class="container">
            ${isTestMode ? `<div class="test-banner">⚠️ TEST MODE ACTIVE — Original Intended Recipient: ${maskEmail(agentEmail)}</div>` : ''}
            <div class="header">
              <span class="badge">Expiration Notice (${reminderDays} Days Remaining)</span>
              <h1 class="title" style="margin-top:12px;">P&C Policy Expiration Reminder</h1>
              <p class="subtitle">Dear ${agentName}, a policy assigned to your account is nearing expiration.</p>
            </div>

            <p style="font-size:14px; line-height:1.6;">
              Please review this policy in SmarTrack CRM and initiate the renewal workflow with the client prior to the expiration date.
            </p>

            <div class="details">
              <div class="row"><span class="label">Client Name:</span><span class="value">${clientName}</span></div>
              <div class="row"><span class="label">Policy Line / Type:</span><span class="value">${pol.policy_type}</span></div>
              <div class="row"><span class="label">Policy Number:</span><span class="value">${pol.policy_number || 'N/A'}</span></div>
              <div class="row"><span class="label">Writing Company / Carrier:</span><span class="value">${carrierName}</span></div>
              <div class="row"><span class="label">Effective Date:</span><span class="value">${formattedEffectiveDate}</span></div>
              <div class="row"><span class="label">Expiration Date:</span><span class="value" style="color:#dc2626;">${formattedExpDate}</span></div>
              <div class="row"><span class="label">Days Remaining:</span><span class="value">${reminderDays} days</span></div>
              <div class="row"><span class="label">Status:</span><span class="value">${pol.status}</span></div>
            </div>

            <div style="text-align: center;">
              <a href="${policyUrl}" class="btn">View Policy in SmarTrack CRM</a>
            </div>

            <div class="footer">
              Automated notification generated by SmarTrack CRM.<br>
              © ${new Date().getFullYear()} SmarTrack CRM. All rights reserved.
            </div>
          </div>
        </body>
        </html>
      `;

      const textBody = `${isTestMode ? '[TEST MODE] Original Recipient: ' + agentEmail + '\n\n' : ''}P&C Policy Expiration Reminder (${reminderDays} Days Remaining)\n\nDear ${agentName},\nThe policy for ${clientName} (${pol.policy_type} #${pol.policy_number || 'N/A'}) with ${carrierName} expires on ${formattedExpDate}.\n\nView Policy in SmarTrack CRM: ${policyUrl}`;

      // 10. INVOKE RESEND REST API
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [targetRecipientEmail],
          subject,
          html: htmlBody,
          text: textBody,
        } as ResendPayload),
      });

      const resendJson = await resendRes.json();

      if (resendRes.ok && resendJson?.id) {
        // Update reservation to 'sent'
        await adminSupabase
          .from('policy_expiration_reminders')
          .update({
            delivery_status: 'sent',
            sent_at: new Date().toISOString(),
            provider_message_id: resendJson.id,
          })
          .eq('id', reservationId);

        sentCount++;
        processedList.push({
          policy_id: pol.id,
          reminder_days: reminderDays,
          recipient: maskEmail(targetRecipientEmail),
          original_agent_email: isTestMode ? maskEmail(agentEmail) : undefined,
          status: 'sent',
          message_id: resendJson.id,
        });
      } else {
        // Update reservation to 'failed' with sanitized error message
        const sanitizedErr = String(resendJson?.message || resendJson?.error || `HTTP ${resendRes.status}`).slice(0, 250);
        await adminSupabase
          .from('policy_expiration_reminders')
          .update({
            delivery_status: 'failed',
            error_message: sanitizedErr,
          })
          .eq('id', reservationId);

        failedCount++;
        processedList.push({
          policy_id: pol.id,
          reminder_days: reminderDays,
          status: 'failed',
          error: sanitizedErr,
        });
      }
    }

    // 11. RETURN STRUCTURED SUMMARY
    return new Response(
      JSON.stringify({
        success: true,
        execution_date_ny: nyTodayStr,
        dry_run: isDryRun,
        test_mode: isTestMode,
        test_email: isTestMode ? testEmailEnv : null,
        summary: {
          total_eligible: (eligiblePolicies || []).length,
          sent: sentCount,
          skipped: skippedCount,
          failed: failedCount,
        },
        details: processedList,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error('Fatal error in send-policy-expiration-reminders:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Fatal internal error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
