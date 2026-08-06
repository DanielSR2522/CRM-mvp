const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace primary SSN input
content = content.replace(
  /<input\s+type="text"\s+value=\{personalForm\.ssn\}\s+onChange=\{e => setPersonalForm\(prev => \(\{ \.\.\.prev, ssn: e\.target\.value \}\)\)\}\s+placeholder="e\.g\. 000-00-0000"\s+className="[^"]*"\s*\/>/s,
  `<SSNInput
                                  value={personalForm.ssn}
                                  onChange={val => setPersonalForm(prev => ({ ...prev, ssn: val }))}
                                />`
);

// Replace co-applicant SSN input
content = content.replace(
  /<input\s+type="text"\s+value=\{coApplicantForm\.ssn\}\s+onChange=\{e => setCoApplicantForm\(prev => \(\{ \.\.\.prev, ssn: e\.target\.value \}\)\)\}\s+placeholder="e\.g\. 000-00-0000"\s+className="[^"]*"\s*\/>/s,
  `<SSNInput
                                      value={coApplicantForm.ssn}
                                      onChange={val => setCoApplicantForm(prev => ({ ...prev, ssn: val }))}
                                    />`
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Finished updating SSN inputs!');
