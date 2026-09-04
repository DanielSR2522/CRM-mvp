import { createServerClient } from '@supabase/ssr';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';

export function createCookieSupabase(cookieStore: ReadonlyRequestCookies): SupabaseClient {
  return createServerClient(
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
}

export async function requireImportUser(supabase: SupabaseClient): Promise<User> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('Unauthorized session.');
  }
  return data.user;
}

export async function assertCanAccessAgent(
  supabase: SupabaseClient,
  agentId: string
): Promise<void> {
  const { data, error } = await supabase.rpc('can_access_agent', {
    target_agent_id: agentId,
    req_scope: 'property_casualty',
  });
  if (error || data !== true) {
    throw new Error('You do not have access to import for this agent.');
  }
}

export async function listAccessibleAgents(supabase: SupabaseClient, userId: string) {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, name, first_name, last_name, email')
    .order('name', { ascending: true });

  if (error) throw error;

  const rows = profiles ?? [];
  const accessChecks = await Promise.all(
    rows.map(async (profile) => {
      if (profile.id === userId) return { profile, canAccess: true };
      const { data } = await supabase.rpc('can_access_agent', {
        target_agent_id: profile.id,
        req_scope: 'property_casualty',
      });
      return { profile, canAccess: data === true };
    })
  );

  return accessChecks
    .filter((item) => item.canAccess)
    .map(({ profile }) => ({
      id: profile.id,
      name:
        `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() ||
        profile.name ||
        profile.email ||
        'Agent',
      email: profile.email ?? null,
    }));
}
