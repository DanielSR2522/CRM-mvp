import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getLanzaBaseUrl(): string {
  if (process.env.LANZA_INTEGRATION_URL) {
    return process.env.LANZA_INTEGRATION_URL.replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }
  return 'https://lsfnan-tickets.vercel.app';
}

export function normalizeToE164(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (trimmed.startsWith('+')) {
    if (digits.length < 10 || digits.length > 15) return null;
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: 'Unauthorized: Winterfell session required.' }, { status: 401 });
    }
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Winterfell session required.' }, { status: 401 });
    }

    const body = await request.json();
    const { whatsappPhone } = body;
    const adminDb = getSupabaseAdmin();

    let normalizedPhone: string | null = null;
    if (whatsappPhone && typeof whatsappPhone === 'string' && whatsappPhone.trim().length > 0) {
      normalizedPhone = normalizeToE164(whatsappPhone);
      if (!normalizedPhone) {
        return NextResponse.json(
          { error: 'Número de WhatsApp inválido. Ingrese un número válido de 10 dígitos (ej: 786-690-7043).' },
          { status: 400 }
        );
      }

      // Enforce uniqueness across Winterfell profiles
      const { data: existing } = await adminDb
        .from('profiles')
        .select('id')
        .eq('whatsapp_phone', normalizedPhone)
        .neq('id', user.id)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: 'Este número de WhatsApp ya está registrado por otro usuario en SmarTrack.' },
          { status: 400 }
        );
      }
    }

    // 1. Update Winterfell profiles table
    const { data: profile, error: updateErr } = await adminDb
      .from('profiles')
      .update({
        whatsapp_phone: normalizedPhone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select('id, email, name, first_name, last_name, role, whatsapp_phone')
      .single();

    if (updateErr) {
      return NextResponse.json(
        { error: `Error al actualizar perfil en SmarTrack: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // 2. Synchronize identity server-to-server with Lanza
    const secret = process.env.WINTERFELL_INTEGRATION_SECRET || '';
    const lanzaSyncUrl = `${getLanzaBaseUrl()}/api/integration/v1/whatsapp-contact/sync`;

    const fullName = profile?.name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Agente CRM';

    const lanzaRes = await fetch(lanzaSyncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-winterfell-integration-secret': secret,
      },
      body: JSON.stringify({
        actorWinterfellProfileId: user.id,
        whatsappPhone: normalizedPhone,
        actorWinterfellEmail: profile?.email || user.email || '',
        actorWinterfellFullName: fullName,
        actorWinterfellRole: (profile as any)?.role || 'agent',
      }),
      cache: 'no-store',
    });

    if (!lanzaRes.ok) {
      const errData = await lanzaRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          success: false,
          error: errData.error || `Error al sincronizar número con el servicio de Tickets (HTTP ${lanzaRes.status}).`,
        },
        { status: 400 }
      );
    }

    const syncData = await lanzaRes.json();

    return NextResponse.json({
      success: true,
      whatsappPhone: normalizedPhone,
      sync: syncData,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  }
}
