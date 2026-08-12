const fs = require('fs');
const path = require('path');

function searchDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules' && file !== 'scratch') {
        searchDir(filePath, fileList);
      }
    } else if (/\.(tsx?|jsx?|html|json|sql)$/.test(file)) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const allFiles = searchDir('.');

const occurrences = {
  agencyUI: [],
  agencyDbPayload: [],
  linkedCompaniesUI: [],
  personalCommercialPolicyLinks: []
};

allFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    if (/Agency|agency_name/i.test(line)) {
      // Exclude Assigned Agent
      if (!/Assigned Agent|writing_company|company_name|agency_name\s*:\s*null/i.test(line)) {
        occurrences.agencyUI.push({ file, lineNum, text: line.trim() });
      }
    }

    if (/agency_name/i.test(line)) {
      occurrences.agencyDbPayload.push({ file, lineNum, text: line.trim() });
    }

    if (/Linked Companies|No companies linked/i.test(line)) {
      occurrences.linkedCompaniesUI.push({ file, lineNum, text: line.trim() });
    }

    if (/personal_commercial_policy_links/i.test(line)) {
      occurrences.personalCommercialPolicyLinks.push({ file, lineNum, text: line.trim() });
    }
  });
});

console.log('=== AGENCY UI / LABELS OCCURRENCES ===');
occurrences.agencyUI.forEach(o => console.log(`${o.file}:${o.lineNum} -> ${o.text}`));

console.log('\n=== AGENCY_NAME DB / PAYLOAD OCCURRENCES ===');
occurrences.agencyDbPayload.forEach(o => console.log(`${o.file}:${o.lineNum} -> ${o.text}`));

console.log('\n=== LINKED COMPANIES UI OCCURRENCES ===');
occurrences.linkedCompaniesUI.forEach(o => console.log(`${o.file}:${o.lineNum} -> ${o.text}`));

console.log('\n=== PERSONAL_COMMERCIAL_POLICY_LINKS OCCURRENCES ===');
occurrences.personalCommercialPolicyLinks.forEach(o => console.log(`${o.file}:${o.lineNum} -> ${o.text}`));
