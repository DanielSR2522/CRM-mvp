const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const AMANDA_EMAIL = 'amandarperezinsurance@gmail.com';
  const LAURA_EMAIL  = 'lauramerloinsurance@gmail.com';

  const { data: amandaProfiles, error: aErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', AMANDA_EMAIL)
    .limit(1);

  if (aErr || !amandaProfiles?.length) {
    throw new Error('Amanda profile not found: ' + (aErr?.message || 'no row'));
  }

  const amanda = amandaProfiles[0];

  const { data: usersData, error: uErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (uErr) throw uErr;

  const lauraAuth = usersData.users.find(
    u => (u.email || '').toLowerCase() === LAURA_EMAIL
  );

  if (!lauraAuth) throw new Error('Laura not found in Supabase Auth');

  const { data: existingLaura, error: lErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', lauraAuth.id)
    .maybeSingle();

  if (lErr) throw lErr;

  if (!existingLaura) {
    const profile = {
      id: lauraAuth.id,
      email: LAURA_EMAIL,
      name: 'Laura Merlo',
      first_name: 'Laura',
      last_name: 'Merlo'
    };

    const { error: insertProfileErr } = await supabase
      .from('profiles')
      .insert(profile);

    if (insertProfileErr) {
      throw new Error('Could not create Laura profile: ' + insertProfileErr.message);
    }

    console.log('Laura profile created ?');
  } else {
    console.log('Laura profile already exists ?');
  }

  const { data: existingLink, error: linkCheckErr } = await supabase
    .from('agent_shared_access')
    .select('*')
    .or(
      `and(agent_id.eq.${amanda.id},shared_agent_id.eq.${lauraAuth.id}),and(agent_id.eq.${lauraAuth.id},shared_agent_id.eq.${amanda.id})`
    );

  if (linkCheckErr) throw linkCheckErr;

  if (!existingLink?.length) {
    const { error: linkErr } = await supabase
      .from('agent_shared_access')
      .insert({
        agent_id: amanda.id,
        shared_agent_id: lauraAuth.id
      });

    if (linkErr) throw new Error('Could not create shared access: ' + linkErr.message);

    console.log('Amanda ? Laura shared access created ?');
  } else {
    console.log('Amanda ? Laura shared access already exists ?');
  }

  const { data: finalLinks, error: finalErr } = await supabase
    .from('agent_shared_access')
    .select('*')
    .or(
      `and(agent_id.eq.${amanda.id},shared_agent_id.eq.${lauraAuth.id}),and(agent_id.eq.${lauraAuth.id},shared_agent_id.eq.${amanda.id})`
    );

  if (finalErr) throw finalErr;

  console.log({
    amanda_id: amanda.id,
    laura_id: lauraAuth.id,
    shared_link_count: finalLinks?.length || 0
  });

  console.log('DONE ?');
}

run().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
