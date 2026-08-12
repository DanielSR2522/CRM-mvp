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

console.log('=== DETAILED TABLE & RLS POLICY AUDIT ===\n');

for (const relFile of sqlFiles) {
  const fullPath = path.join(rootDir, relFile);
  if (!fs.existsSync(fullPath)) continue;
  const content = fs.readFileSync(fullPath, 'utf8');

  console.log(`=======================================================`);
  console.log(`FILE: ${relFile}`);
  console.log(`=======================================================\n`);

  // Extract CREATE TABLE blocks
  const tableMatches = content.matchAll(/CREATE TABLE[\s\S]*?\);/gi);
  for (const m of tableMatches) {
    const tableNameMatch = m[0].match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([^\s\(]+)/i);
    const tableName = tableNameMatch ? tableNameMatch[1] : 'unknown';
    console.log(`TABLE: ${tableName}`);
    // Print first few lines of columns
    const cols = m[0].split('\n').slice(0, 15).join('\n');
    console.log(cols);
    console.log('...\n');
  }

  // Extract CREATE POLICY blocks
  const policyMatches = content.matchAll(/CREATE POLICY[\s\S]*?;/gi);
  for (const m of policyMatches) {
    console.log(`POLICY:\n${m[0].trim()}\n`);
  }

  // Extract CREATE FUNCTION / RPC blocks
  const funcMatches = content.matchAll(/CREATE (?:OR REPLACE )?FUNCTION[\s\S]*?LANGUAGE[\s\S]*?;/gi);
  for (const m of funcMatches) {
    console.log(`FUNCTION:\n${m[0].slice(0, 500)}...\n`);
  }
}
