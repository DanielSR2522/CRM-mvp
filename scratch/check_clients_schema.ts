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

async function checkClientsTable() {
  console.log('=== INSPECTING CLIENTS TABLE SCHEMAS & COLUMNS ===');
  const { data, error } = await supabase.from('clients').select('*').limit(1);
  if (error) {
    console.error('Error selecting clients:', error);
  } else {
    console.log('clients sample keys:', data.length > 0 ? Object.keys(data[0]) : '(empty)');
  }

  // Check client_personal_information table keys
  const { data: pData } = await supabase.from('client_personal_information').select('*').limit(1);
  if (pData) {
    console.log('client_personal_information sample keys:', pData.length > 0 ? Object.keys(pData[0]) : '(empty)');
  }

  // Check client_residence_information table keys
  const { data: rData } = await supabase.from('client_residence_information').select('*').limit(1);
  if (rData) {
    console.log('client_residence_information sample keys:', rData.length > 0 ? Object.keys(rData[0]) : '(empty)');
  }

  // Check life_policies and life_policy_products keys
  const { data: lData } = await supabase.from('life_policies').select('*').limit(1);
  if (lData) {
    console.log('life_policies sample keys:', lData.length > 0 ? Object.keys(lData[0]) : '(empty)');
  }
  const { data: lpData } = await supabase.from('life_policy_products').select('*').limit(1);
  if (lpData) {
    console.log('life_policy_products sample keys:', lpData.length > 0 ? Object.keys(lpData[0]) : '(empty)');
  }

  // Check health_policies keys
  const { data: hData } = await supabase.from('health_policies').select('*').limit(1);
  if (hData) {
    console.log('health_policies sample keys:', hData.length > 0 ? Object.keys(hData[0]) : '(empty)');
  }
}

checkClientsTable();
