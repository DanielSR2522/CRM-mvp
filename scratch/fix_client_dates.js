const fs = require('fs');
const path = require('path');

const clientPagePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(clientPagePath, 'utf-8');

const target1 = "{personalForm.immigration_expiration_date ? new Date(personalForm.immigration_expiration_date + 'T00:00:00').toLocaleDateString() : '-'}";
const replacement1 = "{formatDateMMDDYYYY(personalForm.immigration_expiration_date) || '-'}";

if (content.includes(target1)) {
  content = content.replaceAll(target1, replacement1);
  fs.writeFileSync(clientPagePath, content, 'utf-8');
  console.log('Successfully replaced immigration expiration date formatting in client page!');
} else {
  console.log('Target string not found, checking match...');
}
