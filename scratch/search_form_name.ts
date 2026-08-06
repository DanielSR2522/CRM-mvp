import fs from 'fs';
import path from 'path';

function findFormName() {
  const filePath = path.resolve('src/app/clients/[id]/page.tsx');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  console.log('=== SEARCHING FOR formName AND clientName IN page.tsx ===\n');

  lines.forEach((line, idx) => {
    if (
      line.includes('formName') ||
      line.includes('full_name') ||
      line.includes('insured_name') ||
      line.includes('contact_name') ||
      line.includes('applicant_name')
    ) {
      if (line.includes('set') || line.includes('update') || line.includes('insert') || line.includes('save') || line.includes('payload')) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
      }
    }
  });
}

findFormName();
