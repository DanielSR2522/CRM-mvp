const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../src/app/clients/[id]/policies/[policyId]/page.tsx'), 'utf8');
const lines = content.split('\n');

lines.forEach((l, idx) => {
  if (l.includes('Address on File') || l.includes('useAddressOnFile') || l.includes('use_address_on_file')) {
    console.log(`L${idx + 1}: ${l}`);
  }
});
