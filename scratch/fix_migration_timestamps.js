const fs = require('fs');
const path = require('path');

const migDir = path.join(__dirname, '../supabase/migrations');
const files = fs.readdirSync(migDir);

console.log('Current files:', files);

const renameMap = {
  '20260728_create_health_tax_household_members.sql': '20260728000000_create_health_tax_household_members.sql',
  '20260804_add_agent_info_to_profiles.sql': '20260804000001_add_agent_info_to_profiles.sql',
  '20260804_add_business_lines_to_profiles.sql': '20260804000002_add_business_lines_to_profiles.sql',
  '20260804_create_health_marketplace_plan_tables.sql': '20260804000003_create_health_marketplace_plan_tables.sql',
  '20260804_extend_health_tax_household_members.sql': '20260804000004_extend_health_tax_household_members.sql',
  '20260807_agent_shared_access.sql': '20260807000000_agent_shared_access.sql'
};

for (const [oldName, newName] of Object.entries(renameMap)) {
  const oldPath = path.join(migDir, oldName);
  const newPath = path.join(migDir, newName);
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
    console.log(`Renamed: ${oldName} -> ${newName}`);
  }
}
