import fs from 'fs';
import path from 'path';

function check() {
  const filePath = path.resolve('src/app/clients/[id]/policies/[policyId]/page.tsx');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('.from(') && (line.includes('update') || line.includes('upsert') || line.includes('insert'))) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
}

check();
