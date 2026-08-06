import { createClient } from '@supabase/supabase-js';
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkColumns() {
  console.log('=== INSPECTING HEALTH_POLICY_DOCUMENTS COLUMNS ===');
  // Try inserting an empty object to get column error message or schema info
  const { error: docErr } = await supabase.from('health_policy_documents').insert({});
  console.log('health_policy_documents insert error (reveals columns):', docErr?.message);

  console.log('\n=== INSPECTING HEALTH_POLICY_NOTES COLUMNS ===');
  const { error: noteErr } = await supabase.from('health_policy_notes').insert({});
  console.log('health_policy_notes insert error:', noteErr?.message);

  // Check existing migrations in codebase or sql files if any
}

checkColumns();
