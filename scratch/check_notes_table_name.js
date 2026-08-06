const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = val;
    }
  });
}

const { getSupabaseAdmin } = require('../src/lib/supabaseAdmin');

async function checkNotesTables() {
  const supabase = getSupabaseAdmin();
  const tables = ['notes', 'client_notes', 'activity_events', 'policy_notes', 'health_policy_notes'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    console.log(`Table '${t}':`, error ? error.message : 'EXISTS');
  }
}

checkNotesTables();
