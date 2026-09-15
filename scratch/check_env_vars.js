const fs = require('fs');

const envContent = fs.readFileSync('C:/Users/SEBASTIAN/.gemini/antigravity/scratch/crm-mvp/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach((line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const requiredKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'MARKETING_EMAIL_LIVE_SEND',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'APP_BASE_URL',
];

console.log('--- ENVIRONMENT VARIABLE PRESENCE CHECK ---');
requiredKeys.forEach((key) => {
  const isPresent = Boolean(env[key] && env[key].trim().length > 0);
  console.log(`${key}: ${isPresent ? 'PRESENT ✓' : 'MISSING ❌'}`);
});
