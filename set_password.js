const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('C:/Users/SEBASTIAN/.gemini/antigravity/scratch/crm-mvp/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(l => {
  const p = l.split('=');
  if (p.length >= 2) {
    env[p[0].trim()] = p.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error || !users || users.length === 0) {
    console.error('List users error:', error);
    process.exit(1);
  }
  const user = users[0];
  console.log('User email:', user.email, 'id:', user.id);
  const { data, error: updateErr } = await supabase.auth.admin.updateUserById(user.id, { password: 'Password123!' });
  if (updateErr) {
    console.error('Update password error:', updateErr);
  } else {
    console.log('Successfully set password for:', user.email);
    fs.writeFileSync('C:/Users/SEBASTIAN/.gemini/antigravity/brain/d95dd424-c260-4c09-8d52-3328f1437c0a/user_creds.json', JSON.stringify({
      email: user.email,
      password: 'Password123!'
    }, null, 2));
  }
})();
