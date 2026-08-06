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

async function testInsert() {
  const { data: clients } = await supabase.from('clients').select('id, agent_id').limit(1);
  if (!clients || clients.length === 0) return;
  const client = clients[0];

  const { data: policy } = await supabase.from('health_policies').select('id').eq('client_id', client.id).single();
  if (!policy) return;

  console.log('Testing activity_events insert with policy_id=null and metadata.health_policy_id:', policy.id);
  const { data, error } = await supabase.from('activity_events').insert({
    client_id: client.id,
    policy_id: null,
    actor_id: client.agent_id,
    event_type: 'health_test_event',
    title: 'Test Health Event',
    description: 'Test health event description',
    metadata: { health_policy_id: policy.id }
  }).select('*');

  console.log('Insert result data:', data);
  console.log('Insert result error:', error);
}

testInsert();
