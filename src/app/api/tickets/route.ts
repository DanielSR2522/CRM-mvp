import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { authorizeClientAccess } from '@/lib/integration/authorization';

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

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ALLOWED_POLICY_SOURCES = ['pc', 'health', 'life', 'medicare', 'supplemental'] as const;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Winterfell session required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientIdParam = searchParams.get('clientId');

    const adminDb = getSupabaseAdmin();

    if (clientIdParam) {
      if (!UUID_REGEX.test(clientIdParam)) {
        return NextResponse.json({ error: 'Formato de clientId inválido.' }, { status: 400 });
      }

      const authResult = await authorizeClientAccess(adminDb, user.id, clientIdParam);
      if (!authResult.authorized) {
        return NextResponse.json({ error: 'No tienes permiso para acceder a los tickets de este cliente.' }, { status: 403 });
      }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', user.id)
      .maybeSingle();

    const secret = process.env.WINTERFELL_INTEGRATION_SECRET || '';
    const lanzaUrl = `${getLanzaBaseUrl()}/api/integration/v1/tickets`;

    const lanzaRes = await fetch(lanzaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-winterfell-integration-secret': secret,
      },
      body: JSON.stringify({
        action: 'list',
        actorWinterfellProfileId: user.id,
        actorWinterfellEmail: profile?.email || user.email || '',
        actorWinterfellFullName: profile?.full_name || '',
        actorWinterfellRole: profile?.role || 'agent',
        clientId: clientIdParam || undefined,
      }),
      cache: 'no-store',
    });

    if (!lanzaRes.ok) {
      const errData = await lanzaRes.json().catch(() => ({}));
      return NextResponse.json(
        {
          success: false,
          mapped: false,
          tickets: [],
          appUsers: [],
          error: errData.error || `Lanza integration returned HTTP ${lanzaRes.status}`,
        },
        { status: lanzaRes.status === 401 ? 401 : 502 }
      );
    }

    const data = await lanzaRes.json();

    // Enrich ticket list with real client names from Winterfell DB
    if (data.success && Array.isArray(data.tickets) && data.tickets.length > 0) {
      const clientIds = Array.from(
        new Set(
          data.tickets
            .map((t: any) => t.clientId)
            .filter((id: any): id is string => typeof id === 'string' && UUID_REGEX.test(id))
        )
      );

      if (clientIds.length > 0) {
        const adminDb = getSupabaseAdmin();
        const { data: clientRows } = await adminDb
          .from('clients')
          .select('id, full_name')
          .in('id', clientIds);

        const nameMap = new Map<string, string>();
        (clientRows || []).forEach((c) => {
          if (c.id && c.full_name) {
            nameMap.set(c.id, c.full_name.trim());
          }
        });

        data.tickets = data.tickets.map((t: any) => ({
          ...t,
          clientName: t.clientId ? nameMap.get(t.clientId) || 'Cliente Registrado' : null,
        }));
      }
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        mapped: false,
        tickets: [],
        appUsers: [],
        error: 'Lanza integration service unavailable.',
      },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Winterfell session required.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', user.id)
      .maybeSingle();

    const body = await request.json();
    const action = body.action || 'create';

    const secret = process.env.WINTERFELL_INTEGRATION_SECRET || '';
    const lanzaUrl = `${getLanzaBaseUrl()}/api/integration/v1/tickets`;
    const adminDb = getSupabaseAdmin();

    // Handle Operational Actions
    if (action === 'get') {
      const { ticketId } = body;
      if (!ticketId) {
        return NextResponse.json({ error: 'Identificador de ticket requerido.' }, { status: 400 });
      }

      const lanzaRes = await fetch(lanzaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-winterfell-integration-secret': secret,
        },
        body: JSON.stringify({
          action: 'get',
          actorWinterfellProfileId: user.id,
          actorWinterfellEmail: profile?.email || user.email || '',
          actorWinterfellFullName: profile?.full_name || '',
          actorWinterfellRole: profile?.role || 'agent',
          ticketId,
        }),
        cache: 'no-store',
      });

      if (!lanzaRes.ok) {
        const errData = await lanzaRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: errData.error || `Error al obtener detalles del ticket (HTTP ${lanzaRes.status}).` },
          { status: lanzaRes.status }
        );
      }

      const data = await lanzaRes.json();
      if (!data.success || !data.ticket) {
        return NextResponse.json({ error: data.error || 'Ticket no encontrado.' }, { status: 404 });
      }

      const ticket = data.ticket;

      // Authorize client access if ticket has an associated client
      if (ticket.clientId && UUID_REGEX.test(ticket.clientId)) {
        const authResult = await authorizeClientAccess(adminDb, user.id, ticket.clientId);
        if (!authResult.authorized) {
          return NextResponse.json({ error: 'No tienes permiso para acceder a este ticket.' }, { status: 403 });
        }
      }

      // Enrich client details if clientId exists
      let clientDetails = null;
      if (ticket.clientId && UUID_REGEX.test(ticket.clientId)) {
        const { data: cRow } = await adminDb
          .from('clients')
          .select('id, full_name, phone, email, address')
          .eq('id', ticket.clientId)
          .maybeSingle();

        if (cRow) {
          clientDetails = {
            id: cRow.id,
            name: cRow.full_name ? cRow.full_name.trim() : 'Cliente Registrado',
            phone: cRow.phone || null,
            email: cRow.email || null,
            address: cRow.address || null,
          };
          ticket.clientName = clientDetails.name;
        }
      }

      // Enrich policy details if policyId exists
      let policyDetails = null;
      if (ticket.policyId && UUID_REGEX.test(ticket.policyId) && ticket.policySource) {
        if (ticket.policySource === 'pc') {
          const { data: pRow } = await adminDb
            .from('policies')
            .select('id, policy_number, company_name, writing_company')
            .eq('id', ticket.policyId)
            .maybeSingle();
          if (pRow) {
            policyDetails = {
              id: pRow.id,
              policyNumber: pRow.policy_number || null,
              carrierName: pRow.company_name || pRow.writing_company || 'P&C',
              source: 'pc' as const,
            };
          }
        } else if (ticket.policySource === 'health') {
          const { data: pRow } = await adminDb
            .from('health_policies')
            .select('id, application_number, company_2026, plan_name')
            .eq('id', ticket.policyId)
            .maybeSingle();
          if (pRow) {
            policyDetails = {
              id: pRow.id,
              policyNumber: pRow.application_number || null,
              carrierName: pRow.company_2026 || pRow.plan_name || 'Salud',
              source: 'health' as const,
            };
          }
        } else if (ticket.policySource === 'life') {
          const { data: pRow } = await adminDb
            .from('life_policies')
            .select('id, policy_number')
            .eq('id', ticket.policyId)
            .maybeSingle();
          if (pRow) {
            policyDetails = {
              id: pRow.id,
              policyNumber: pRow.policy_number || null,
              carrierName: 'Vida',
              source: 'life' as const,
            };
          }
        }
      }

      ticket.clientDetails = clientDetails;
      ticket.policyDetails = policyDetails;

      return NextResponse.json({
        success: true,
        ticket,
        appUsers: data.appUsers || [],
      });
    }

    if (action === 'update') {
      const { ticketId, status, priority, dueAt, assignedTo, tags } = body;
      if (!ticketId) {
        return NextResponse.json({ error: 'Identificador de ticket requerido.' }, { status: 400 });
      }

      const lanzaRes = await fetch(lanzaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-winterfell-integration-secret': secret,
        },
        body: JSON.stringify({
          action: 'update',
          actorWinterfellProfileId: user.id,
          actorWinterfellEmail: profile?.email || user.email || '',
          actorWinterfellFullName: profile?.full_name || '',
          actorWinterfellRole: profile?.role || 'agent',
          ticketId,
          status,
          priority,
          dueAt,
          assignedToWinterfellProfileId: assignedTo !== undefined ? assignedTo : undefined,
          tags,
        }),
        cache: 'no-store',
      });

      if (!lanzaRes.ok) {
        const errData = await lanzaRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: errData.error || `Error al actualizar el ticket (HTTP ${lanzaRes.status}).` },
          { status: lanzaRes.status }
        );
      }

      const data = await lanzaRes.json();
      return NextResponse.json(data);
    }

    if (action === 'add_note') {
      const { ticketId } = body;
      const rawText = body.content || body.body || body.text;
      if (!ticketId || !rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
        return NextResponse.json({ error: 'El contenido de la nota no puede estar vacío.' }, { status: 400 });
      }

      const cleanText = rawText.trim();
      const lanzaRes = await fetch(lanzaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-winterfell-integration-secret': secret,
        },
        body: JSON.stringify({
          action: 'add_note',
          actorWinterfellProfileId: user.id,
          actorWinterfellEmail: profile?.email || user.email || '',
          actorWinterfellFullName: profile?.full_name || '',
          actorWinterfellRole: profile?.role || 'agent',
          ticketId,
          content: cleanText,
          body: cleanText,
        }),
        cache: 'no-store',
      });

      if (!lanzaRes.ok) {
        const errData = await lanzaRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: errData.error || `Error al agregar la nota (HTTP ${lanzaRes.status}).` },
          { status: lanzaRes.status }
        );
      }

      const data = await lanzaRes.json();
      return NextResponse.json(data);
    }

    if (action === 'upload_attachment') {
      const { ticketId: attTicketId, fileName, fileBase64, mimeType, sizeBytes } = body;
      if (!attTicketId || !fileName || !fileBase64) {
        return NextResponse.json({ error: 'Parámetros de archivo incompletos.' }, { status: 400 });
      }

      const lanzaRes = await fetch(lanzaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-winterfell-integration-secret': secret,
        },
        body: JSON.stringify({
          action: 'upload_attachment',
          actorWinterfellProfileId: user.id,
          actorWinterfellEmail: profile?.email || user.email || '',
          actorWinterfellFullName: profile?.full_name || '',
          actorWinterfellRole: profile?.role || 'agent',
          ticketId: attTicketId,
          fileName,
          fileBase64,
          mimeType,
          sizeBytes,
        }),
        cache: 'no-store',
      });

      if (!lanzaRes.ok) {
        const errData = await lanzaRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: errData.error || `Error al subir el archivo (HTTP ${lanzaRes.status}).` },
          { status: lanzaRes.status }
        );
      }

      const data = await lanzaRes.json();
      return NextResponse.json(data);
    }

    if (action === 'get_attachment_url') {
      const { attachmentId } = body;
      if (!attachmentId) {
        return NextResponse.json({ error: 'Identificador de archivo requerido.' }, { status: 400 });
      }

      const lanzaRes = await fetch(lanzaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-winterfell-integration-secret': secret,
        },
        body: JSON.stringify({
          action: 'get_attachment_url',
          actorWinterfellProfileId: user.id,
          actorWinterfellEmail: profile?.email || user.email || '',
          actorWinterfellFullName: profile?.full_name || '',
          actorWinterfellRole: profile?.role || 'agent',
          attachmentId,
        }),
        cache: 'no-store',
      });

      if (!lanzaRes.ok) {
        const errData = await lanzaRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: errData.error || `Error al obtener enlace (HTTP ${lanzaRes.status}).` },
          { status: lanzaRes.status }
        );
      }

      const data = await lanzaRes.json();
      return NextResponse.json(data);
    }


    if (action === 'add_checklist') {
      const { ticketId, title } = body;
      if (!ticketId || !title || typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json({ error: 'El título del checklist no puede estar vacío.' }, { status: 400 });
      }

      const lanzaRes = await fetch(lanzaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-winterfell-integration-secret': secret,
        },
        body: JSON.stringify({
          action: 'add_checklist',
          actorWinterfellProfileId: user.id,
          actorWinterfellEmail: profile?.email || user.email || '',
          actorWinterfellFullName: profile?.full_name || '',
          actorWinterfellRole: profile?.role || 'agent',
          ticketId,
          title: title.trim(),
        }),
        cache: 'no-store',
      });

      if (!lanzaRes.ok) {
        const errData = await lanzaRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: errData.error || `Error al crear el checklist (HTTP ${lanzaRes.status}).` },
          { status: lanzaRes.status }
        );
      }

      const data = await lanzaRes.json();
      return NextResponse.json(data);
    }

    if (action === 'delete_checklist') {
      const { ticketId, checklistId } = body;
      if (!ticketId || !checklistId) {
        return NextResponse.json({ error: 'Identificador de checklist requerido.' }, { status: 400 });
      }

      const lanzaRes = await fetch(lanzaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-winterfell-integration-secret': secret,
        },
        body: JSON.stringify({
          action: 'delete_checklist',
          actorWinterfellProfileId: user.id,
          actorWinterfellEmail: profile?.email || user.email || '',
          actorWinterfellFullName: profile?.full_name || '',
          actorWinterfellRole: profile?.role || 'agent',
          ticketId,
          checklistId,
        }),
        cache: 'no-store',
      });

      if (!lanzaRes.ok) {
        const errData = await lanzaRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: errData.error || `Error al eliminar el checklist (HTTP ${lanzaRes.status}).` },
          { status: lanzaRes.status }
        );
      }

      const data = await lanzaRes.json();
      return NextResponse.json(data);
    }

    if (action === 'add_checklist_item') {
      const { ticketId, checklistId, assignedTo, assignedToWinterfellProfileId } = body;
      const rawText = body.content || body.title || body.text;
      if (!ticketId || !rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
        return NextResponse.json({ error: 'El contenido del paso no puede estar vacío.' }, { status: 400 });
      }

      const cleanText = rawText.trim();
      const lanzaRes = await fetch(lanzaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-winterfell-integration-secret': secret,
        },
        body: JSON.stringify({
          action: 'add_checklist_item',
          actorWinterfellProfileId: user.id,
          actorWinterfellEmail: profile?.email || user.email || '',
          actorWinterfellFullName: profile?.full_name || '',
          actorWinterfellRole: profile?.role || 'agent',
          ticketId,
          checklistId: checklistId || undefined,
          title: cleanText,
          content: cleanText,
          assignedToWinterfellProfileId: assignedToWinterfellProfileId || assignedTo || undefined,
        }),
        cache: 'no-store',
      });

      if (!lanzaRes.ok) {
        const errData = await lanzaRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: errData.error || `Error al agregar la tarea (HTTP ${lanzaRes.status}).` },
          { status: lanzaRes.status }
        );
      }

      const data = await lanzaRes.json();
      return NextResponse.json(data);
    }

    if (action === 'delete_checklist_item') {
      const { ticketId, itemId } = body;
      if (!ticketId || !itemId) {
        return NextResponse.json({ error: 'Identificador del paso requerido.' }, { status: 400 });
      }

      const lanzaRes = await fetch(lanzaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-winterfell-integration-secret': secret,
        },
        body: JSON.stringify({
          action: 'delete_checklist_item',
          actorWinterfellProfileId: user.id,
          actorWinterfellEmail: profile?.email || user.email || '',
          actorWinterfellFullName: profile?.full_name || '',
          actorWinterfellRole: profile?.role || 'agent',
          ticketId,
          itemId,
        }),
        cache: 'no-store',
      });

      if (!lanzaRes.ok) {
        const errData = await lanzaRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: errData.error || `Error al eliminar el paso (HTTP ${lanzaRes.status}).` },
          { status: lanzaRes.status }
        );
      }

      const data = await lanzaRes.json();
      return NextResponse.json(data);
    }

    if (action === 'toggle_checklist_item') {
      const { ticketId, itemId, isDone } = body;
      if (!ticketId || !itemId) {
        return NextResponse.json({ error: 'Parámetros requeridos faltantes para cambiar estado de tarea.' }, { status: 400 });
      }

      const lanzaRes = await fetch(lanzaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-winterfell-integration-secret': secret,
        },
        body: JSON.stringify({
          action: 'toggle_checklist_item',
          actorWinterfellProfileId: user.id,
          actorWinterfellEmail: profile?.email || user.email || '',
          actorWinterfellFullName: profile?.full_name || '',
          actorWinterfellRole: profile?.role || 'agent',
          ticketId,
          itemId,
          isDone: Boolean(isDone),
        }),
        cache: 'no-store',
      });

      if (!lanzaRes.ok) {
        const errData = await lanzaRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: errData.error || `Error al actualizar la tarea (HTTP ${lanzaRes.status}).` },
          { status: lanzaRes.status }
        );
      }

      const data = await lanzaRes.json();
      return NextResponse.json(data);
    }

    // Default / Create Ticket Action
    const { clientId, policyId, policySource, assignedTo, title, description, priority, status, dueAt, tags } = body;

    if (!clientId || typeof clientId !== 'string' || !UUID_REGEX.test(clientId)) {
      return NextResponse.json({ error: 'Debe seleccionar un cliente válido para crear el ticket.' }, { status: 400 });
    }

    // 1. Validate client access authorization
    const authResult = await authorizeClientAccess(adminDb, user.id, clientId);
    if (!authResult.authorized || !authResult.client) {
      return NextResponse.json({ error: 'Cliente no encontrado o no tienes permiso para acceder a este cliente.' }, { status: 400 });
    }

    // 2. Validate policy ownership (if policy is selected)
    if (policyId) {
      if (typeof policyId !== 'string' || !UUID_REGEX.test(policyId)) {
        return NextResponse.json({ error: 'Identificador de póliza inválido.' }, { status: 400 });
      }
      if (!policySource || !ALLOWED_POLICY_SOURCES.includes(policySource as any)) {
        return NextResponse.json({ error: 'Tipo de póliza no especificado o no válido.' }, { status: 400 });
      }

      const tableMap: Record<string, string> = {
        pc: 'policies',
        health: 'health_policies',
        life: 'life_policies',
        medicare: 'medicare_policies',
        supplemental: 'supplemental_policies',
      };

      const tableName = tableMap[policySource];
      const { data: policyRow } = await adminDb
        .from(tableName)
        .select('id, client_id')
        .eq('id', policyId)
        .maybeSingle();

      if (!policyRow || policyRow.client_id !== clientId) {
        return NextResponse.json({ error: 'La póliza seleccionada no pertenece al cliente especificado.' }, { status: 400 });
      }
    }

    const lanzaRes = await fetch(lanzaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-winterfell-integration-secret': secret,
      },
      body: JSON.stringify({
        action: 'create',
        actorWinterfellProfileId: user.id,
        actorWinterfellEmail: profile?.email || user.email || '',
        actorWinterfellFullName: profile?.full_name || '',
        actorWinterfellRole: profile?.role || 'agent',
        assignedToWinterfellProfileId: assignedTo || null,
        title,
        description,
        priority,
        status,
        dueAt,
        tags,
        clientId,
        policyId: policyId || null,
        policySource: policySource || null,
      }),
      cache: 'no-store',
    });

    if (!lanzaRes.ok) {
      const errData = await lanzaRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.error || `Error en servicio de tickets (HTTP ${lanzaRes.status}).` },
        { status: lanzaRes.status }
      );
    }

    const data = await lanzaRes.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Servicio de integración no disponible.' },
      { status: 503 }
    );
  }
}
