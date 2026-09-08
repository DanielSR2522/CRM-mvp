import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { MarketingCampaign } from '@/types/marketing';

export interface AuthenticatedAgent {
  agentId: string;
  email: string | null;
  isTestAgent?: boolean;
}

export interface OwnershipValidationResult {
  authorized: boolean;
  status: 200 | 401 | 403 | 404;
  error?: string;
  agentId?: string;
  campaign?: MarketingCampaign;
}

/**
 * Resolves the authenticated agent identity server-side.
 * Checks Next.js session cookies (@supabase/ssr), Authorization Bearer headers,
 * or custom test header (x-agent-id) for automated multi-tenant isolation testing.
 */
export async function resolveAuthenticatedAgent(req: NextRequest): Promise<AuthenticatedAgent | null> {
  // 1. Check for test header (used ONLY in non-production environments for automated multi-tenant isolation testing)
  const isTestOrDev = process.env.NODE_ENV !== 'production' || process.env.ALLOW_TEST_AGENT_HEADERS === 'true';
  const testAgentHeader = isTestOrDev ? (req.headers.get('x-agent-id') || req.headers.get('x-test-agent-id')) : null;
  if (testAgentHeader) {
    return {
      agentId: testAgentHeader,
      email: `${testAgentHeader}@smartrack.com`,
      isTestAgent: true,
    };
  }

  // 2. Check Next.js session cookies via @supabase/ssr
  try {
    const cookieStore = await cookies();
    const supabaseServer = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      }
    );

    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user) {
      return {
        agentId: user.id,
        email: user.email || null,
      };
    }
  } catch (e) {}

  // 3. Check Authorization Bearer header
  const authHeader = req.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (accessToken && isAdminConfigured()) {
    try {
      const admin = getSupabaseAdmin();
      const { data: { user } } = await admin.auth.getUser(accessToken);
      if (user) {
        return {
          agentId: user.id,
          email: user.email || null,
        };
      }
    } catch (e) {}
  }

  // 4. No authenticated agent resolved
  return null;
}

/**
 * Resolves all authorized agent IDs for the current authenticated request.
 * Enforces strict multi-tenant isolation: defaults strictly to [currentAgentId].
 * Includes additional agent IDs only if explicit role/delegation permissions exist.
 */
export async function getAuthorizedAgentIds(
  req: NextRequest,
  dbClient?: SupabaseClient
): Promise<string[]> {
  const authUser = await resolveAuthenticatedAgent(req);
  if (!authUser?.agentId) return [];

  const agentId = authUser.agentId;

  // In test mode or default agent mode:
  if (authUser.isTestAgent) {
    return [agentId];
  }

  const authorized = new Set<string>([agentId]);

  if (dbClient) {
    try {
      // Check if user is an ADMIN or SUPERVISOR role
      const { data: profile } = await dbClient
        .from('profiles')
        .select('id, role')
        .eq('id', agentId)
        .single();

      if (profile?.role === 'ADMIN' || profile?.role === 'SUPERVISOR') {
        // ADMIN / SUPERVISOR can access all profiles if authorized
        const { data: allProfiles } = await dbClient.from('profiles').select('id');
        if (allProfiles) {
          allProfiles.forEach((p) => authorized.add(p.id));
        }
      }
    } catch (e) {}
  }

  return Array.from(authorized);
}

/**
 * Validates campaign ownership for an authenticated agent.
 * Enforces strict multi-tenant isolation by checking campaign ID + agent ownership scope.
 */
export async function validateCampaignOwnership(
  req: NextRequest,
  campaignId: string,
  dbClient: SupabaseClient
): Promise<OwnershipValidationResult> {
  // 1. Authenticate user server-side
  const authenticatedUser = await resolveAuthenticatedAgent(req);
  if (!authenticatedUser) {
    return {
      authorized: false,
      status: 401,
      error: '401 Unauthorized: Server-side authentication required.',
    };
  }

  const { agentId } = authenticatedUser;

  // 2. Fetch campaign by ID
  const { data: campaign, error: cError } = await dbClient
    .from('marketing_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (cError || !campaign) {
    return {
      authorized: false,
      status: 404,
      error: `Campaign '${campaignId}' not found.`,
      agentId,
    };
  }

  const campaignOwnerId = campaign.agent_id || campaign.created_by;

  // 3. Strict Ownership & Scope Validation
  if (campaignOwnerId && campaignOwnerId !== agentId) {
    // Check shared delegation RPC if configured
    let hasSharedAccess = false;
    try {
      const { data: accessGranted } = await dbClient.rpc('can_access_agent', {
        target_agent_id: campaignOwnerId,
        req_scope: 'marketing',
      });
      if (accessGranted === true) {
        hasSharedAccess = true;
      }
    } catch (e) {}

    if (!hasSharedAccess) {
      return {
        authorized: false,
        status: 403,
        error: `403 Forbidden: Agent '${agentId}' is not authorized to access or dispatch campaign '${campaignId}' owned by Agent '${campaignOwnerId}'.`,
        agentId,
        campaign: campaign as MarketingCampaign,
      };
    }
  }

  return {
    authorized: true,
    status: 200,
    agentId,
    campaign: campaign as MarketingCampaign,
  };
}
