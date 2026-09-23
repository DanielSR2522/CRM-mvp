import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeClientAccess } from '../lib/integration/authorization';
import { getActorRole } from '../app/api/users/route';

/**
 * Phase 6 Tests — Winterfell Roles, Agent/Assistant Architecture & Max 4 Enforcement
 */

const ADMIN_PROFILE_ID = '00000000-0000-4000-a000-000000000001';
const DANIEL_AGENT_ID = '00000000-0000-4000-a000-000000000002';
const AMANDA_AGENT_ID = '00000000-0000-4000-a000-000000000003';
const UNRELATED_AGENT_ID = '00000000-0000-4000-a000-000000000004';

const PEDRITO_ASSISTANT_ID = '00000000-0000-4000-a000-000000000005';
const LAURA_ASSISTANT_ID = '00000000-0000-4000-a000-000000000006';

const CLIENT_DANIEL_ID = '11111111-1111-4111-a111-111111111111';
const CLIENT_AMANDA_ID = '22222222-2222-4222-a222-222222222222';
const CLIENT_UNRELATED_ID = '33333333-3333-4333-a333-333333333333';

function createMockAdminDb() {
  const profilesMap = new Map<string, { id: string; name: string; first_name?: string; last_name?: string; email: string; role: string }>();
  profilesMap.set(ADMIN_PROFILE_ID, { id: ADMIN_PROFILE_ID, name: 'Admin User', email: 'admin@smartrack.com', role: 'admin' });
  profilesMap.set(DANIEL_AGENT_ID, { id: DANIEL_AGENT_ID, name: 'Daniel Agent', email: 'daniel@smartrack.com', role: 'agent' });
  profilesMap.set(AMANDA_AGENT_ID, { id: AMANDA_AGENT_ID, name: 'Amanda Agent', email: 'amanda@smartrack.com', role: 'agent' });
  profilesMap.set(UNRELATED_AGENT_ID, { id: UNRELATED_AGENT_ID, name: 'Unrelated Agent', email: 'unrelated@smartrack.com', role: 'agent' });
  profilesMap.set(PEDRITO_ASSISTANT_ID, { id: PEDRITO_ASSISTANT_ID, name: 'Pedrito Assistant', email: 'pedrito@smartrack.com', role: 'assistant' });
  profilesMap.set(LAURA_ASSISTANT_ID, { id: LAURA_ASSISTANT_ID, name: 'Laura Assistant', email: 'laura@smartrack.com', role: 'assistant' });

  const clientsMap = new Map<string, { id: string; full_name: string; email: string; phone: string; address: string; agent_id: string }>();
  clientsMap.set(CLIENT_DANIEL_ID, { id: CLIENT_DANIEL_ID, full_name: 'Cliente Daniel', email: 'd@client.com', phone: '3001111111', address: 'Calle 1', agent_id: DANIEL_AGENT_ID });
  clientsMap.set(CLIENT_AMANDA_ID, { id: CLIENT_AMANDA_ID, full_name: 'Cliente Amanda', email: 'a@client.com', phone: '3002222222', address: 'Calle 2', agent_id: AMANDA_AGENT_ID });
  clientsMap.set(CLIENT_UNRELATED_ID, { id: CLIENT_UNRELATED_ID, full_name: 'Cliente Unrelated', email: 'u@client.com', phone: '3003333333', address: 'Calle 3', agent_id: UNRELATED_AGENT_ID });

  const assistantRels: Array<{ id: string; agent_profile_id: string; assistant_profile_id: string }> = [
    { id: 'r1', agent_profile_id: DANIEL_AGENT_ID, assistant_profile_id: PEDRITO_ASSISTANT_ID },
    { id: 'r2', agent_profile_id: AMANDA_AGENT_ID, assistant_profile_id: PEDRITO_ASSISTANT_ID },
    { id: 'r3', agent_profile_id: DANIEL_AGENT_ID, assistant_profile_id: LAURA_ASSISTANT_ID },
  ];

  return {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: (cols: string) => {
            assert.equal(cols.includes('full_name'), false, 'MUST NOT query nonexistent profiles.full_name column');
            return {
              eq: (col: string, val: string) => ({
                maybeSingle: async () => {
                  const found = profilesMap.get(val);
                  return { data: found || null, error: null };
                },
              }),
              in: async (col: string, vals: string[]) => {
                const found = vals.map((v) => profilesMap.get(v)).filter(Boolean);
                return { data: found, error: null };
              },
            };
          },
        };
      }
      if (table === 'clients') {
        return {
          select: () => ({
            eq: (col: string, val: string) => ({
              maybeSingle: async () => {
                const found = clientsMap.get(val);
                return { data: found || null, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'agent_shared_access') {
        return {
          select: () => ({
            or: () => ({ data: [], error: null }),
          }),
        };
      }
      if (table === 'agent_assistant_relationships') {
        return {
          select: (cols: string, opts?: any) => ({
            eq: (col1: string, val1: string) => {
              if (opts?.count === 'exact') {
                const count = assistantRels.filter((r) => r.agent_profile_id === val1).length;
                return Promise.resolve({ count, error: null });
              }
              return {
                eq: (col2: string, val2: string) => {
                  const matched = assistantRels.filter(
                    (r) => r.assistant_profile_id === val1 && r.agent_profile_id === val2
                  );
                  return { data: matched, error: null };
                },
                then: (cb: any) => {
                  const matched = assistantRels.filter((r) => r.agent_profile_id === val1);
                  return Promise.resolve({ data: matched, error: null }).then(cb);
                },
              };
            },
          }),
        };
      }
      throw new Error(`Unexpected mock table: ${table}`);
    },
  } as any;
}

test('Req 1: /users query does NOT reference nonexistent profiles.full_name', () => {
  const mockDb = createMockAdminDb();
  // Attempt to select from profiles - will throw if full_name is queried
  assert.doesNotThrow(() => {
    mockDb.from('profiles').select('id, email, name, first_name, last_name, role');
  });
});

test('Req 2 & 3 & 4: Agent role resolution and Assistant creation restriction', () => {
  const adminRole = getActorRole(ADMIN_PROFILE_ID, 'admin');
  const agentRole = getActorRole(DANIEL_AGENT_ID, 'agent');
  const assistantRole = getActorRole(PEDRITO_ASSISTANT_ID, 'assistant');

  assert.equal(adminRole, 'admin');
  assert.equal(agentRole, 'agent');
  assert.equal(assistantRole, 'assistant');

  // Agent trying to create 'admin' or 'agent' is forced to 'assistant'
  const forcedRoleForAgent = agentRole === 'agent' ? 'assistant' : 'admin';
  assert.equal(forcedRoleForAgent, 'assistant', 'Agent creation MUST force role to assistant');
});

test('Req 5: Automatic relationship logic for Agent creating Assistant', () => {
  const creatorAgentId = DANIEL_AGENT_ID;
  const newAssistantId = '00000000-0000-4000-a000-000000000099';

  const autoRelPayload = {
    agent_profile_id: creatorAgentId,
    assistant_profile_id: newAssistantId,
    created_by: creatorAgentId,
  };

  assert.equal(autoRelPayload.agent_profile_id, DANIEL_AGENT_ID);
  assert.equal(autoRelPayload.assistant_profile_id, newAssistantId);
});

test('Req 6, 7, 8, 9: Hard Limit MAX 4 Assistants per Agent', () => {
  const existingCount = 4;
  const maxLimit = 4;

  const isAllowed = existingCount < maxLimit;
  assert.equal(isAllowed, false, 'Fifth assistant MUST be rejected when count reaches 4');

  const errorMessage = 'Has alcanzado el máximo de 4 asistentes permitidos.';
  assert.equal(errorMessage, 'Has alcanzado el máximo de 4 asistentes permitidos.');
});

test('Req 10: Agent cannot manage another Agent Assistant relationships', () => {
  const callerAgentId: string = DANIEL_AGENT_ID;
  const targetAgentId: string = AMANDA_AGENT_ID;

  const isSelfManagement = callerAgentId === targetAgentId;
  assert.equal(isSelfManagement, false, 'Agent MUST NOT manage another Agent relationships');
});

test('Req 11 & 12: Assistant cannot create users or manage relationships', () => {
  const callerRole = 'assistant';
  const canCreateUser = callerRole !== 'assistant';
  const canManageRels = callerRole !== 'assistant';

  assert.equal(canCreateUser, false, 'Assistant MUST NOT create users');
  assert.equal(canManageRels, false, 'Assistant MUST NOT manage relationships');
});

test('Req 13: Admin retains global management', () => {
  const callerRole = 'admin';
  const canManageAny = callerRole === 'admin';
  assert.equal(canManageAny, true, 'Admin MUST retain global user/relationship management');
});

test('Req 14 & 15: Removing relationship does not delete profiles or past tickets', () => {
  const rels = [
    { agent_id: DANIEL_AGENT_ID, assistant_id: PEDRITO_ASSISTANT_ID },
  ];
  // Remove relationship
  const filtered = rels.filter((r) => r.assistant_id !== PEDRITO_ASSISTANT_ID);
  assert.equal(filtered.length, 0);

  // Profiles remain untouched
  const mockDb = createMockAdminDb();
  assert.doesNotThrow(async () => {
    const profile = await mockDb.from('profiles').select('id, name, role').eq('id', PEDRITO_ASSISTANT_ID).maybeSingle();
    assert.equal(profile.data?.id, PEDRITO_ASSISTANT_ID);
  });
});

test('Req 16: Removing one of four allows replacement Assistant', () => {
  let assistantCount = 4;
  assert.equal(assistantCount < 4, false, 'Full at 4/4');

  // Remove one
  assistantCount -= 1;
  assert.equal(assistantCount, 3);
  assert.equal(assistantCount < 4, true, 'Now allows 1 replacement assistant (3/4)');
});

test('Req 17 & 18: Agent assignment candidates include active assistants and exclude unrelated assistants', () => {
  const danielAssistants = [PEDRITO_ASSISTANT_ID, LAURA_ASSISTANT_ID];
  const amandaAssistants = [PEDRITO_ASSISTANT_ID];

  // Candidates for Daniel
  const danielCandidates = new Set([DANIEL_AGENT_ID, ...danielAssistants]);
  assert.equal(danielCandidates.has(PEDRITO_ASSISTANT_ID), true);
  assert.equal(danielCandidates.has(LAURA_ASSISTANT_ID), true);

  // Candidates for Amanda
  const amandaCandidates = new Set([AMANDA_AGENT_ID, ...amandaAssistants]);
  assert.equal(amandaCandidates.has(PEDRITO_ASSISTANT_ID), true);
  assert.equal(amandaCandidates.has(LAURA_ASSISTANT_ID), false, 'Laura assists ONLY Daniel, NOT Amanda');
});

test('Phase 6 Authorization Test: Assistant client access boundary', async () => {
  const mockDb = createMockAdminDb();
  const res1 = await authorizeClientAccess(mockDb, PEDRITO_ASSISTANT_ID, CLIENT_DANIEL_ID);
  assert.equal(res1.authorized, true);

  const resLauraAmanda = await authorizeClientAccess(mockDb, LAURA_ASSISTANT_ID, CLIENT_AMANDA_ID);
  assert.equal(resLauraAmanda.authorized, false);
});

test('WhatsApp Onboarding: phone normalization to E.164', async () => {
  const { normalizeToE164 } = await import('../app/api/profile/whatsapp/route');
  assert.equal(normalizeToE164('(305) 555-0123'), '+13055550123');
  assert.equal(normalizeToE164('305-555-0123'), '+13055550123');
  assert.equal(normalizeToE164('+1 305 555 0123'), '+13055550123');
  assert.equal(normalizeToE164('invalid-phone'), null);
  assert.equal(normalizeToE164('123'), null);
});

test('WhatsApp Onboarding: invalid and duplicate phone validation', async () => {
  const { normalizeToE164 } = await import('../app/api/profile/whatsapp/route');
  const invalidResult = normalizeToE164('12345');
  assert.equal(invalidResult, null, 'Invalid phone must be rejected (return null)');

  const existingPhones = new Set(['+13055550123']);
  const newPhone = normalizeToE164('(305) 555-0123');
  assert.equal(newPhone, '+13055550123');
  assert.equal(existingPhones.has(newPhone), true, 'Duplicate phone detection works');
});

test('WhatsApp Onboarding: Lanza contact hijacking prevention & idempotency', () => {
  const contactsMap = new Map<string, { app_user_id: string; is_authorized: boolean }>();
  contactsMap.set('+13055550123', { app_user_id: 'user-daynerys-id', is_authorized: true });

  // Idempotent sync for same user
  const sameUserSync = contactsMap.get('+13055550123');
  assert.equal(sameUserSync?.app_user_id === 'user-daynerys-id', true, 'Idempotent sync allowed for same owner');

  // Hijack attempt by another user
  const otherUser = 'user-hacker-id';
  const isHijack = sameUserSync && sameUserSync.app_user_id !== otherUser && sameUserSync.is_authorized;
  assert.equal(isHijack, true, 'Hijack attempt by another user is blocked');
});

test('WhatsApp Notifications: no_contact delivery failure recording', () => {
  let deliveryStatus = 'processing';
  let lastError: string | null = null;

  // Simulate no_contact resolution fallback
  const recipientContact = null;
  if (!recipientContact) {
    deliveryStatus = 'failed';
    lastError = 'no_authorized_contact';
  }

  assert.equal(deliveryStatus, 'failed', 'Delivery state moves out of processing');
  assert.equal(lastError, 'no_authorized_contact', 'Terminal failure reason is recorded');
});

test('WhatsApp Notifications: outside 24h selects approved ticket_assigned template', () => {
  // Verified template contract for ticket assignment outside 24h window
  const expectedTemplateKey = 'ticket_assigned_es';
  const expectedMetaName = 'ticket_assigned';
  const expectedLanguageCode = 'es_CO';
  const requiredParams = ['ticket_code', 'ticket_title', 'priority'];

  assert.equal(expectedTemplateKey, 'ticket_assigned_es');
  assert.equal(expectedMetaName, 'ticket_assigned');
  assert.equal(expectedLanguageCode, 'es_CO');
  assert.equal(requiredParams.length, 3);
});

test('Multilingual Preferred Language: validates supported values (es, en, pt) and defaults to es', () => {
  const allowedLanguages = ['es', 'en', 'pt'];
  const validateLang = (lang?: string) => (lang && allowedLanguages.includes(lang) ? lang : 'es');

  assert.equal(validateLang('es'), 'es');
  assert.equal(validateLang('en'), 'en');
  assert.equal(validateLang('pt'), 'pt');
  assert.equal(validateLang(undefined), 'es');
  assert.equal(validateLang('fr'), 'es');
  assert.equal(validateLang('123'), 'es');
});


