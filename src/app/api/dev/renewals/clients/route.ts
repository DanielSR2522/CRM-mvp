import { NextResponse, type NextRequest } from 'next/server';
import { getLoniRenewalHealthClients } from '@/lib/renewals/loni-clients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Disabled in production' }, { status: 404 });
  }

  try {
    const { clients, totalHpCount, distinctClientCount } = await getLoniRenewalHealthClients();

    const url = new URL(req.url);
    const clientIdParam = url.searchParams.get('clientId');

    if (clientIdParam) {
      const matchedClient = clients.find((c) => c.client_id === clientIdParam || c.id === clientIdParam);
      const isMatched = Boolean(matchedClient);
      console.log(`[Renewal Validator] requested_client_id: ${clientIdParam} matched_in_winterfell: ${isMatched}`);

      return NextResponse.json({
        valid: isMatched,
        client: matchedClient || null,
        clients,
      });
    }

    console.log(`[Renewal Clients] health policies: ${totalHpCount}`);
    console.log(`[Renewal Clients] distinct clients: ${distinctClientCount}`);
    console.log(`[Renewal Clients] accessible to Loni: ${clients.length}`);

    return NextResponse.json({ clients });
  } catch (err: any) {
    console.error('[Winterfell Dev Clients Exception]:', err);
    return NextResponse.json({ error: err?.message || 'Failed to fetch Health clients' }, { status: 500 });
  }
}
