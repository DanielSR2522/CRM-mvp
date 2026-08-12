const fs = require('fs');

const files = ['supabase/migrations/20260807000000_agent_shared_access.sql', 'supabase/migrations/20260810000000_scoped_pc_shared_access.sql'];

files.forEach(f => {
  if (fs.existsSync(f)) {
    const text = fs.readFileSync(f, 'utf8');
    console.log(`\n=================== FILE: ${f} ===================`);
    text.split('\n').forEach((line, idx) => {
      if (line.includes('policy_document') || line.includes('policy_documents') || line.includes('policy_document_sections')) {
        console.log(`Line ${idx+1}: ${line}`);
      }
    });
  }
});
