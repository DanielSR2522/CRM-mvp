const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const sqlFiles = [
  'migration.sql',
  'migration_leads.sql',
  'migration_lead_notes_documents_timeline.sql',
  'migration_client_personal_info.sql',
  'migration_convert_lead_to_client.sql',
  'migration_health_policies.sql',
  'migration_life_policies.sql',
  'migration_notes_timeline.sql',
  'migration_policy_documents.sql',
  'migration_policy_expiration_reminders.sql',
  'migration_policy_note_attachments.sql',
  'migration_electronic_signatures.sql',
  'migration_signatures_token_reissue.sql',
  'migration_client_deletion_rpc.sql',
  'migration_calendar_appointments.sql',
  'migration_calendar_recurrence.sql',
  'supabase/migrations/20260728_create_health_tax_household_members.sql',
  'supabase/migrations/20260804_add_agent_info_to_profiles.sql',
  'supabase/migrations/20260804_add_business_lines_to_profiles.sql',
  'supabase/migrations/20260804_create_health_marketplace_plan_tables.sql',
  'supabase/migrations/20260804_extend_health_tax_household_members.sql',
];

const results = [];

for (const relFile of sqlFiles) {
  const fullPath = path.join(rootDir, relFile);
  if (!fs.existsSync(fullPath)) continue;
  const content = fs.readFileSync(fullPath, 'utf8');

  const parts = content.split(/CREATE\s+POLICY\s+/i);
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const endIdx = part.indexOf(';');
    const policyBody = part.substring(0, endIdx > -1 ? endIdx : part.length).trim();
    
    // Parse "policy_name" ON table_name
    const onIdx = policyBody.search(/\s+ON\s+/i);
    if (onIdx > -1) {
      const namePart = policyBody.substring(0, onIdx).trim().replace(/^["']|["']$/g, '');
      const afterOn = policyBody.substring(onIdx + 4).trim();
      const firstWord = afterOn.split(/\s+/)[0].replace(/^public\./, '').replace(/^["']|["']$/g, '');
      results.push({
        file: relFile,
        policy: namePart,
        table: firstWord,
        sql: `CREATE POLICY ${policyBody};`
      });
    }
  }
}

fs.writeFileSync(path.join(rootDir, 'scratch', 'policies_dump.json'), JSON.stringify(results, null, 2));

const byTable = {};
for (const p of results) {
  if (!byTable[p.table]) byTable[p.table] = [];
  byTable[p.table].push(p);
}

console.log('=== TABLES WITH RLS POLICIES ===\n');
for (const [table, pols] of Object.entries(byTable)) {
  console.log(`Table: ${table} (${pols.length} policies)`);
  for (const pol of pols) {
    console.log(`  - [${pol.file}] ${pol.policy}`);
  }
  console.log('');
}
