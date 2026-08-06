const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace onPoliciesChanged={fetchOverviewPolicies} with inline refresh or loadPolicies
content = content.replace(
  'onPoliciesChanged={fetchOverviewPolicies}',
  'onPoliciesChanged={() => { fetchPersonalInformation(); }}'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed fetchOverviewPolicies scope in page.tsx!');
