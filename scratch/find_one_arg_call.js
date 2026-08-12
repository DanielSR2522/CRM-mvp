const fs = require('fs');

const text = fs.readFileSync('supabase/migrations/20260810000000_scoped_pc_shared_access.sql', 'utf8');
const lines = text.split('\n');

lines.forEach((line, i) => {
  if (line.includes('can_access_agent(') && !line.includes('property_casualty') && !line.includes('CREATE OR REPLACE') && !line.includes('DROP FUNCTION')) {
    console.log(`Line ${i+1}: ${line.trim()}`);
  }
});
