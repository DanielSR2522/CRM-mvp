const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function getAllFiles(dir, exts, filesList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (file === 'node_modules' || file === '.next' || file === '.git') continue;
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getAllFiles(filePath, exts, filesList);
    } else {
      if (exts.some(ext => filePath.endsWith(ext))) {
        filesList.push(filePath);
      }
    }
  }
  return filesList;
}

console.log('=== AUDITING SQL MIGRATION FILES ===\n');

const sqlFiles = getAllFiles(rootDir, ['.sql']);
for (const file of sqlFiles) {
  const relPath = path.relative(rootDir, file);
  const content = fs.readFileSync(file, 'utf8');
  
  // Find tables
  const tables = [...content.matchAll(/CREATE\ TABLE\ (IF\ NOT\ EXISTS\ )?([a-zA-Z0-9_"\.]+)/gi)].map(m => m[2]);
  // Find RLS policies
  const policies = [...content.matchAll(/CREATE\ POLICY\ (IF\ NOT\ EXISTS\ )?["']?([^"'\ \n]+)["']?\ ON\ (IF\ NOT\ EXISTS\ )?([a-zA-Z0-9_"\.]+)/gi)].map(m => `${m[2]} ON ${m[4]}`);
  // Find RPCs
  const rpcs = [...content.matchAll(/CREATE\ (OR\ REPLACE\ )?FUNCTION\ ([a-zA-Z0-9_"\.]+)/gi)].map(m => m[2]);

  if (tables.length || policies.length || rpcs.length) {
    console.log(`--- File: ${relPath} ---`);
    if (tables.length) console.log('  Tables:', [...new Set(tables)].join(', '));
    if (policies.length) console.log('  Policies:\n   ', policies.join('\n    '));
    if (rpcs.length) console.log('  RPCs:', [...new Set(rpcs)].join(', '));
    console.log('');
  }
}

console.log('=== AUDITING FRONTEND AGENT_ID FILTERS IN SRC/ ===\n');

const srcFiles = getAllFiles(path.join(rootDir, 'src'), ['.ts', '.tsx', '.js', '.jsx']);
for (const file of srcFiles) {
  const relPath = path.relative(rootDir, file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('agent_id')) {
      console.log(`${relPath}:${idx + 1}: ${line.trim()}`);
    }
  });
}
