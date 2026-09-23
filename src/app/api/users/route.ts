import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { AMANDA_UUID, LAURA_UUID } from '@/lib/auth/agentDisplay';
import { normalizeToE164 } from '@/app/api/profile/whatsapp/route';

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

const ALLOWED_ROLES = ['admin', 'agent', 'assistant'] as const;
type UserRole = typeof ALLOWED_ROLES[number];

export function getActorRole(userId: string, role?: string): 'admin' | 'agent' | 'assistant' {
  if (userId === AMANDA_UUID || userId === LAURA_UUID) return 'admin';
  const r = (role || '').toLowerCase();
  if (r === 'admin' || r === 'agent' || r === 'assistant') return r as any;
  return 'agent';
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized session.' }, { status: 401 });
    }

    const adminDb = getSupabaseAdmin();
    const { data: actorProfile } = await adminDb
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    const actorRole = getActorRole(user.id, actorProfile?.role);

    if (actorRole === 'assistant') {
      return NextResponse.json({ error: 'Forbidden: Assistants cannot view user management.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const roleFilter = searchParams.get('role');

    if (actorRole === 'agent') {
      // Agent sees their profile and their active assistants
      const { data: rels } = await adminDb
        .from('agent_assistant_relationships')
        .select('assistant_profile_id')
        .eq('agent_profile_id', user.id);

      const assistantIds = (rels || []).map((r: any) => r.assistant_profile_id).filter(Boolean);
      const myAssistantsCount = assistantIds.length;

      const targetIds = Array.from(new Set([user.id, ...assistantIds]));

      const { data: profiles, error } = await adminDb
        .from('profiles')
        .select('id, email, name, first_name, last_name, role, created_at')
        .in('id', targetIds)
        .order('name', { ascending: true });

      if (error) {
        return NextResponse.json({ error: `Failed to fetch users: ${error.message}` }, { status: 500 });
      }

      const users = (profiles || []).map((p: any) => {
        const fn = p.first_name || '';
        const ln = p.last_name || '';
        const name = `${fn} ${ln}`.trim() || p.name || p.email?.split('@')[0] || 'Usuario';
        return {
          id: p.id,
          name,
          email: p.email || '',
          role: (p.role || 'assistant').toLowerCase() as UserRole,
          createdAt: p.created_at,
          isSelf: p.id === user.id,
        };
      });

      return NextResponse.json({
        success: true,
        actorRole: 'agent',
        actorProfileId: user.id,
        myAssistantsCount,
        maxAssistants: 4,
        users,
      });
    }

    // Admin sees all users
    let query = adminDb
      .from('profiles')
      .select('id, email, name, first_name, last_name, role, created_at')
      .order('name', { ascending: true });

    if (roleFilter && ALLOWED_ROLES.includes(roleFilter as UserRole)) {
      query = query.eq('role', roleFilter);
    }

    const { data: profiles, error } = await query;

    if (error) {
      return NextResponse.json({ error: `Failed to fetch users: ${error.message}` }, { status: 500 });
    }

    const users = (profiles || []).map((p: any) => {
      const fn = p.first_name || '';
      const ln = p.last_name || '';
      const name = `${fn} ${ln}`.trim() || p.name || p.email?.split('@')[0] || 'Usuario';
      return {
        id: p.id,
        name,
        email: p.email || '',
        role: (p.role || 'agent').toLowerCase() as UserRole,
        createdAt: p.created_at,
      };
    });

    return NextResponse.json({
      success: true,
      actorRole: 'admin',
      actorProfileId: user.id,
      users,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized session.' }, { status: 401 });
    }

    const adminDb = getSupabaseAdmin();
    const { data: actorProfile } = await adminDb
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    const actorRole = getActorRole(user.id, actorProfile?.role);

    if (actorRole === 'assistant') {
      return NextResponse.json({ error: 'Forbidden: Assistants cannot create users or update roles.' }, { status: 403 });
    }

    const body = await request.json();
    const { action = 'create_user', targetUserId, role, email, password, fullName, firstName, lastName } = body;

    if (action === 'update_role') {
      if (actorRole !== 'admin') {
        return NextResponse.json({ error: 'Forbidden: Only administrators can update user roles.' }, { status: 403 });
      }

      if (!targetUserId || !role || !ALLOWED_ROLES.includes(role as UserRole)) {
        return NextResponse.json({ error: 'targetUserId and valid role required.' }, { status: 400 });
      }

      const { error: updateErr } = await adminDb
        .from('profiles')
        .update({ role: role.toLowerCase() })
        .eq('id', targetUserId);

      if (updateErr) {
        return NextResponse.json({ error: `Failed to update user role: ${updateErr.message}` }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'User role updated successfully.' });
    }

    if (action === 'create_user') {
      if (!email || !password) {
        return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
      }

      const rawWhatsappPhone = body.whatsappPhone || body.whatsapp_phone;
      const rawLanguage = body.preferredLanguage || body.preferred_language;
      const VALID_LANGUAGES = ['es', 'en', 'pt'] as const;
      const preferredLanguage = (rawLanguage && VALID_LANGUAGES.includes(rawLanguage.toLowerCase()))
        ? rawLanguage.toLowerCase()
        : 'es';

      if (actorRole === 'agent' && (!rawWhatsappPhone || typeof rawWhatsappPhone !== 'string' || !rawWhatsappPhone.trim())) {
        return NextResponse.json({ error: 'El teléfono WhatsApp es requerido para crear un asistente.' }, { status: 400 });
      }

      let normalizedWhatsappPhone: string | null = null;
      if (rawWhatsappPhone && typeof rawWhatsappPhone === 'string' && rawWhatsappPhone.trim()) {
        normalizedWhatsappPhone = normalizeToE164(rawWhatsappPhone);
        if (!normalizedWhatsappPhone) {
          return NextResponse.json({ error: 'El teléfono WhatsApp es inválido. Formato requerido: (XXX) XXX-XXXX o +1XXXXXXXXXX.' }, { status: 400 });
        }

        const { data: existingPhone } = await adminDb
          .from('profiles')
          .select('id')
          .eq('whatsapp_phone', normalizedWhatsappPhone)
          .maybeSingle();

        if (existingPhone) {
          return NextResponse.json({ error: 'El teléfono WhatsApp ya está registrado por otro usuario.' }, { status: 400 });
        }
      }

      let targetRole: UserRole = 'assistant';

      if (actorRole === 'agent') {
        // AGENT CAN ONLY CREATE ASSISTANT. Ignore any attempted role override.
        targetRole = 'assistant';

        // Check Max 4 Assistants hard limit server-side
        const { count, error: countErr } = await adminDb
          .from('agent_assistant_relationships')
          .select('id', { count: 'exact', head: true })
          .eq('agent_profile_id', user.id);

        if (countErr) {
          return NextResponse.json({ error: `Failed to check assistant count: ${countErr.message}` }, { status: 500 });
        }

        if (count !== null && count >= 4) {
          return NextResponse.json({ error: 'Has alcanzado el máximo de 4 asistentes permitidos.' }, { status: 400 });
        }
      } else if (actorRole === 'admin') {
        targetRole = (role && ALLOWED_ROLES.includes(role.toLowerCase() as UserRole))
          ? (role.toLowerCase() as UserRole)
          : 'agent';
      }

      const fn = firstName || '';
      const ln = lastName || '';
      const computedName = fullName || `${fn} ${ln}`.trim() || email.split('@')[0];

      // Create Auth user via Supabase Auth Admin API
      const { data: authData, error: authErr } = await adminDb.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: {
          full_name: computedName,
          first_name: fn,
          last_name: ln,
          role: targetRole,
          preferred_language: preferredLanguage,
        },
      });

      if (authErr || !authData.user) {
        return NextResponse.json({ error: `Failed to create auth user: ${authErr?.message || 'Unknown error'}` }, { status: 400 });
      }

      const newUserId = authData.user.id;

      // Upsert profile in public.profiles using valid columns
      const { error: profileErr } = await adminDb.from('profiles').upsert({
        id: newUserId,
        email: email.trim().toLowerCase(),
        name: computedName,
        first_name: fn,
        last_name: ln,
        role: targetRole,
        whatsapp_phone: normalizedWhatsappPhone,
        preferred_language: preferredLanguage,
      });

      if (profileErr) {
        return NextResponse.json({ error: `Failed to save profile: ${profileErr.message}` }, { status: 500 });
      }

      // Sync contact to Lanza if WhatsApp phone is provided
      if (normalizedWhatsappPhone) {
        const secret = process.env.WINTERFELL_INTEGRATION_SECRET || '';
        const lanzaUrl = `${getLanzaBaseUrl()}/api/integration/v1/whatsapp-contact/sync`;
        await fetch(lanzaUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-winterfell-integration-secret': secret,
          },
          body: JSON.stringify({
            actorWinterfellProfileId: newUserId,
            whatsappPhone: normalizedWhatsappPhone,
            actorWinterfellEmail: email.trim().toLowerCase(),
            actorWinterfellFullName: computedName,
            actorWinterfellRole: targetRole,
          }),
          cache: 'no-store',
        }).catch(() => null);
      }

      // Automatic relationship creation when an Agent creates an Assistant
      let relationshipCreated = false;
      if (actorRole === 'agent') {
        const { error: relErr } = await adminDb
          .from('agent_assistant_relationships')
          .insert({
            agent_profile_id: user.id,
            assistant_profile_id: newUserId,
            created_by: user.id,
          });

        if (relErr) {
          const isMaxError = relErr.message?.includes('máximo') || relErr.message?.includes('4');
          const errorMsg = isMaxError
            ? 'Has alcanzado el máximo de 4 asistentes permitidos.'
            : `Usuario creado, pero falló la vinculación automática: ${relErr.message}`;
          return NextResponse.json({ error: errorMsg }, { status: 400 });
        }
        relationshipCreated = true;
      }

      return NextResponse.json({
        success: true,
        user: {
          id: newUserId,
          name: computedName,
          email: email.trim().toLowerCase(),
          role: targetRole,
        },
        relationshipCreated,
      });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
