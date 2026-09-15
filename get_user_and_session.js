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
    console.error('Error fetching users:', error);
    process.exit(1);
  }
  const testUser = users[0];
  console.log('Found user:', testUser.email, testUser.id);
  
  // Generate magiclink / session link or password reset link to obtain session
  const { data, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: testUser.email
  });
  
  if (linkErr) {
    console.error('Generate link error:', linkErr);
    process.exit(1);
  }
  
  console.log('Magic link:', data.properties.action_link);
  fs.writeFileSync('C:/Users/SEBASTIAN/.gemini/antigravity/brain/d95dd424-c260-4c09-8d52-3328f1437c0a/magic_link.json', JSON.stringify({
    email: testUser.email,
    userId: testUser.id,
    actionLink: data.properties.action_link,
    hashedToken: data.properties.hashed_token
  }, null, 2));
})();
