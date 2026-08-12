const fs = require('fs');

const content = fs.readFileSync('supabase/migrations/20260807000000_agent_shared_access.sql', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
  if (line.toLowerCase().includes('signature')) {
    console.log(`Line ${i+1}: ${line}`);
  }
});
