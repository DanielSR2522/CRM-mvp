import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify client ownership
    const { data: client, error: cErr } = await supabase
      .from('clients')
      .select('id, agent_id, agency_name')
      .eq('id', clientId)
      .single();

    if (cErr || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    if (client.agent_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: Owner-only payment access' }, { status: 403 });
    }

    // Query payment information
    const { data: paymentInfo, error: pErr } = await supabase
      .from('client_payment_information')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    if (!paymentInfo) {
      return NextResponse.json({
        auto_pay: false,
        payment_day: null,
        associated_address: '',
        account_holder_name: '',
        has_bank_account: false,
        bank_name: '',
        bank_last4: '',
        has_card: false,
        card_type: null,
        card_last4: '',
        expiration_month: '',
        expiration_year: '',
      });
    }

    // Return strictly non-secret masked payload to client browser
    return NextResponse.json({
      id: paymentInfo.id,
      client_id: paymentInfo.client_id,
      auto_pay: paymentInfo.auto_pay,
      payment_day: paymentInfo.payment_day,
      associated_address: paymentInfo.associated_address || '',
      account_holder_name: paymentInfo.account_holder_name || '',
      has_bank_account: paymentInfo.has_bank_account,
      bank_name: paymentInfo.bank_name || '',
      bank_last4: paymentInfo.bank_last4 || '',
      has_card: paymentInfo.has_card,
      card_type: paymentInfo.card_type || null,
      card_last4: paymentInfo.card_last4 || '',
      expiration_month: paymentInfo.expiration_month || '',
      expiration_year: paymentInfo.expiration_year || '',
    });
  } catch (err: any) {
    console.error('GET Payment Info Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify client ownership
    const { data: client, error: cErr } = await supabase
      .from('clients')
      .select('id, agent_id')
      .eq('id', clientId)
      .single();

    if (cErr || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    if (client.agent_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: Owner-only payment access' }, { status: 403 });
    }

    const body = await req.json();
    const {
      auto_pay,
      payment_day,
      associated_address,
      account_holder_name,
      has_bank_account,
      bank_name,
      routing_number,
      account_number,
      has_card,
      card_type,
      card_number,
      expiration_month,
      expiration_year,
    } = body;

    // Validate payment_day (integer 1..31 or null)
    let pDay: number | null = null;
    if (payment_day !== null && payment_day !== undefined && payment_day !== '') {
      const numDay = Number(payment_day);
      if (isNaN(numDay) || numDay < 1 || numDay > 31) {
        return NextResponse.json({ error: 'Payment day must be a number between 1 and 31' }, { status: 400 });
      }
      pDay = Math.floor(numDay);
    }

    // Query existing record if present to preserve unchanged encrypted fields
    const { data: existing } = await supabase
      .from('client_payment_information')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle();

    // Dynamically import server-side encryption module
    const { encryptPaymentField } = await import('@/lib/payments/encryption');

    // Process Bank Account Fields
    let finalBankName = bank_name ? String(bank_name).trim() : null;
    let finalRoutingEnc = existing?.routing_number_encrypted || null;
    let finalAccountEnc = existing?.account_number_encrypted || null;
    let finalBankLast4 = existing?.bank_last4 || null;

    if (has_bank_account) {
      if (routing_number && account_number) {
        const cleanRouting = String(routing_number).replace(/\D/g, '');
        const cleanAccount = String(account_number).replace(/\D/g, '');

        if (!cleanRouting || !cleanAccount) {
          return NextResponse.json({ error: 'Routing number and account number must contain valid digits' }, { status: 400 });
        }

        const rEnc = encryptPaymentField(cleanRouting, clientId, 'routing_number');
        const aEnc = encryptPaymentField(cleanAccount, clientId, 'account_number');

        finalRoutingEnc = JSON.stringify(rEnc);
        finalAccountEnc = JSON.stringify(aEnc);
        finalBankLast4 = cleanAccount.slice(-4);
      }
    } else {
      // Clear bank method details when disabled
      finalBankName = null;
      finalRoutingEnc = null;
      finalAccountEnc = null;
      finalBankLast4 = null;
    }

    // Process Card Fields
    let finalCardType = card_type ? String(card_type).trim() : null;
    let finalCardEnc = existing?.card_number_encrypted || null;
    let finalCardLast4 = existing?.card_last4 || null;
    let finalExpMonth = expiration_month ? String(expiration_month).trim() : null;
    let finalExpYear = expiration_year ? String(expiration_year).trim() : null;

    if (has_card) {
      if (card_number) {
        const cleanCard = String(card_number).replace(/\D/g, '');
        if (cleanCard.length < 12) {
          return NextResponse.json({ error: 'Invalid card number' }, { status: 400 });
        }

        const cEnc = encryptPaymentField(cleanCard, clientId, 'card_number');
        finalCardEnc = JSON.stringify(cEnc);
        finalCardLast4 = cleanCard.slice(-4);
      }
    } else {
      // Clear card method details when disabled
      finalCardType = null;
      finalCardEnc = null;
      finalCardLast4 = null;
      finalExpMonth = null;
      finalExpYear = null;
    }

    // Upsert payment information record
    const upsertPayload = {
      client_id: clientId,
      agent_id: user.id,
      auto_pay: Boolean(auto_pay),
      payment_day: pDay,
      associated_address: associated_address ? String(associated_address).trim() : null,
      account_holder_name: account_holder_name ? String(account_holder_name).trim() : null,
      has_bank_account: Boolean(has_bank_account),
      bank_name: finalBankName,
      routing_number_encrypted: finalRoutingEnc,
      account_number_encrypted: finalAccountEnc,
      bank_last4: finalBankLast4,
      has_card: Boolean(has_card),
      card_type: finalCardType,
      card_number_encrypted: finalCardEnc,
      card_last4: finalCardLast4,
      expiration_month: finalExpMonth,
      expiration_year: finalExpYear,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveErr } = await supabase
      .from('client_payment_information')
      .upsert(upsertPayload, { onConflict: 'client_id' })
      .select()
      .single();

    if (saveErr) {
      return NextResponse.json({ error: saveErr.message }, { status: 500 });
    }

    return NextResponse.json({
      id: saved.id,
      client_id: saved.client_id,
      auto_pay: saved.auto_pay,
      payment_day: saved.payment_day,
      associated_address: saved.associated_address || '',
      account_holder_name: saved.account_holder_name || '',
      has_bank_account: saved.has_bank_account,
      bank_name: saved.bank_name || '',
      bank_last4: saved.bank_last4 || '',
      has_card: saved.has_card,
      card_type: saved.card_type || null,
      card_last4: saved.card_last4 || '',
      expiration_month: saved.expiration_month || '',
      expiration_year: saved.expiration_year || '',
    });
  } catch (err: any) {
    console.error('POST Payment Info Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
