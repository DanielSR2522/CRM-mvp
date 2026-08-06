import fs from 'fs';
import path from 'path';

function findCalls() {
  const filePath = path.resolve('src/app/clients/[id]/page.tsx');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  console.log('=== SEARCHING FOR savePersonalField CALLS IN page.tsx ===\n');

  lines.forEach((line, idx) => {
    if (line.includes('savePersonalField')) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
}

findCalls();
