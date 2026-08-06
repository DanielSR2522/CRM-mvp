import fs from 'fs';
import path from 'path';

function checkFile() {
  const filePath = path.resolve('src/app/clients/[id]/policies/[policyId]/page.tsx');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (
      line.includes('update(') ||
      line.includes('upsert(') ||
      line.includes('insert(') ||
      line.includes('from(')
    ) {
      if (
        line.includes('clients') ||
        line.includes('personal') ||
        line.includes('residence') ||
        line.includes('full_name')
      ) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
      }
    }
  });
}

checkFile();
