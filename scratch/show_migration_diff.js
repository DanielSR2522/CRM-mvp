const fs = require('fs');

const text = fs.readFileSync('supabase/migrations/20260810000000_scoped_pc_shared_access.sql', 'utf8');
const lines = text.split('\n');

console.log('=== Section 3b & Section 4 in 20260810000000_scoped_pc_shared_access.sql ===\n');
lines.slice(45, 95).forEach((line, i) => console.log(`${i+46}: ${line}`));
