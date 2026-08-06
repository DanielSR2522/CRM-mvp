const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let envUrl = '';
let envServiceKey = '';

try {
  const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
  envContent.split('\n').forEach(line => {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) envUrl = line.split('=')[1].trim();
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) envServiceKey = line.split('=')[1].trim();
  });
} catch {}

const client = createClient(envUrl, envServiceKey);

async function diagnoseCoercion() {
  console.log('===========================================================');
  console.log('DIAGNOSING "Cannot coerce the result to a single JSON object"');
  console.log('===========================================================\n');

  // 1. Fetch all rows in auth.users
  const { data: { users }, error: uErr } = await client.auth.admin.listUsers();
  console.log(`- Auth Users Count: ${users ? users.length : 0}`);
  if (users) {
    users.forEach(u => {
      console.log(`  Auth User: id="${u.id}" | email="${u.email}"`);
    });
  }

  // 2. Fetch all rows in public.profiles
  const { data: profiles, error: pErr } = await client
    .from('profiles')
    .select('*');

  console.log(`\n- Public.profiles Count: ${profiles ? profiles.length : 0}`);
  if (profiles) {
    profiles.forEach(p => {
      console.log(`  Profile Row: id="${p.id}" | name="${p.name}" | email="${p.email}" | user_id="${p.user_id || 'N/A'}" | business_lines:`, p.business_lines);
    });
  }

  // 3. Test .single() vs .maybeSingle() for each auth user against profiles
  console.log('\n--- TESTING .single() vs .maybeSingle() FOR EACH AUTH USER ---');
  if (users) {
    for (const u of users) {
      // Test by id
      const { data: resId, error: errId } = await client
        .from('profiles')
        .select('*')
        .eq('id', u.id)
        .single()
        .catch(() => ({ data: null, error: 'exception' }));

      // Test by user_id if column exists
      let resUserId = null;
      let errUserId = null;
      if (profiles && profiles.length > 0 && 'user_id' in profiles[0]) {
        const res = await client
          .from('profiles')
          .select('*')
          .eq('user_id', u.id)
          .single();
        resUserId = res.data;
        errUserId = res.error;
      }

      console.log(`\nUser: ${u.email} (id: ${u.id})`);
      console.log(`  .eq('id', '${u.id}').single() =>`, {
        returnedData: resId,
        errorCode: errId?.code,
        errorMessage: errId?.message,
        errorDetails: errId?.details,
        errorHint: errId?.hint
      });

      if (errUserId !== null) {
        console.log(`  .eq('user_id', '${u.id}').single() =>`, {
          returnedData: resUserId,
          errorCode: errUserId?.code,
          errorMessage: errUserId?.message,
          errorDetails: errUserId?.details,
          errorHint: errUserId?.hint
        });
      }
    }
  }
}

diagnoseCoercion().catch(console.error);
