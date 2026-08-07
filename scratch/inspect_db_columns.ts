import fs from 'fs';
import path from 'path';

function loadEnv() {
  try {
    const envPath = path.resolve('.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            process.env[key] = val;
          }
        }
      }
    }
  } catch (e) {
    console.error('Error loading env:', e);
  }
}

loadEnv();

async function inspectColumns() {
  const { getSupabaseAdmin } = await import('../src/lib/supabaseAdmin');
  const supabase = getSupabaseAdmin();

  const tables = [
    'clients',
    'client_personal_information',
    'client_residence_information',
    'profiles',
    'health_policies',
    'health_policy_tax_members',
    'policies',
    'life_policies',
    'life_products',
    'life_beneficiaries'
  ];

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table ${table}: error ->`, error.message);
    } else if (data && data.length > 0) {
      console.log(`Table ${table} columns:`, Object.keys(data[0]));
    } else {
      console.log(`Table ${table} exists (0 rows)`);
    }
  }
}

inspectColumns();
