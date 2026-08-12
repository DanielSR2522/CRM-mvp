const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};

envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false }
});

async function getAuthenticatedClient(email) {
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: 'magiclink',
      email
    });

  if (linkError) throw new Error(`${email}: ${linkError.message}`);

  const tokenHash = linkData.properties.hashed_token;

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false }
  });

  const { data: verified, error: verifyError } =
    await authClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink'
    });

  if (verifyError) throw new Error(`${email}: ${verifyError.message}`);

  const userClient = createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${verified.session.access_token}`
      }
    },
    auth: { persistSession: false }
  });

  return {
    client: userClient,
    user: verified.user
  };
}

async function testUser(label, email, otherAgentId) {
  const { client, user } = await getAuthenticatedClient(email);

  console.log(`\n===== ${label} =====`);
  console.log('Logged in as:', user.email);
  console.log('User ID:', user.id);

  const { data: access, error: rpcError } =
    await client.rpc('can_access_agent', {
      target_agent_id: otherAgentId
    });

  console.log(
    'can_access_agent(other):',
    rpcError ? `ERROR: ${rpcError.message}` : access
  );

  const { data: clients, error: clientsError } =
    await client
      .from('clients')
      .select('id,agent_id')
      .limit(100);

  if (clientsError) {
    console.log('CLIENT QUERY ERROR:', clientsError.message);
    return;
  }

  const own = clients.filter(c => c.agent_id === user.id);
  const shared = clients.filter(c => c.agent_id === otherAgentId);

  console.log('Own clients visible:', own.length);
  console.log('Other agent clients visible:', shared.length);

  console.table(
    clients.map(c => ({
      client_id: c.id,
      owner: c.agent_id === user.id ? 'OWN' :
             c.agent_id === otherAgentId ? 'SHARED' : 'OTHER'
    }))
  );
}

async function run() {
  const AMANDA_ID = '78fab56d-c5f0-4658-aed8-fef2a25710e2';
  const LAURA_ID  = 'b8c07e53-9f4e-4093-9959-d7d062d4d89f';

  await testUser(
    'AMANDA',
    'amandarperezinsurance@gmail.com',
    LAURA_ID
  );

  await testUser(
    'LAURA',
    'lauramerloinsurance@gmail.com',
    AMANDA_ID
  );
}

run()
  .then(() => console.log('\n===== TEST COMPLETE ====='))
  .catch(err => {
    console.error('\nTEST FAILED:', err.message);
    process.exit(1);
  });
