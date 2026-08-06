const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Primary Phone read-only display
content = content.replace(
  `<span className="font-semibold text-slate-800 block min-h-[20px]">{personalForm.phone || '-'}</span>`,
  `<span className="font-semibold text-slate-800 block min-h-[20px]">{formatUSPhone(personalForm.phone) || '-'}</span>`
);

// Primary Phone edit input
content = content.replace(
  /<input\s+type="text"\s+value=\{personalForm\.phone\}\s+onChange=\{e => setPersonalForm\(prev => \(\{ \.\.\.prev, phone: e\.target\.value \}\)\)\}\s+className="[^"]*"\s*\/>/s,
  `<PhoneInput
                                  value={personalForm.phone}
                                  onChange={val => setPersonalForm(prev => ({ ...prev, phone: val }))}
                                />`
);

// Secondary Phone read-only display
content = content.replace(
  `<span className="font-semibold text-slate-800 block min-h-[20px]">{personalForm.secondary_phone || '-'}</span>`,
  `<span className="font-semibold text-slate-800 block min-h-[20px]">{formatUSPhone(personalForm.secondary_phone) || '-'}</span>`
);

// Secondary Phone edit input
content = content.replace(
  /<input\s+type="text"\s+value=\{personalForm\.secondary_phone\}\s+onChange=\{e => setPersonalForm\(prev => \(\{ \.\.\.prev, secondary_phone: e\.target\.value \}\)\)\}\s+className="[^"]*"\s*\/>/s,
  `<PhoneInput
                                  value={personalForm.secondary_phone}
                                  onChange={val => setPersonalForm(prev => ({ ...prev, secondary_phone: val }))}
                                />`
);

// Co-applicant Phone read-only display
content = content.replace(
  `<span className="font-semibold text-slate-800 block min-h-[20px]">{coApplicantInfo?.primary_phone || '-'}</span>`,
  `<span className="font-semibold text-slate-800 block min-h-[20px]">{formatUSPhone(coApplicantInfo?.primary_phone) || '-'}</span>`
);

// Co-applicant Phone edit input
content = content.replace(
  /<input\s+type="text"\s+value=\{coApplicantForm\.primary_phone\}\s+onChange=\{e => setCoApplicantForm\(prev => \(\{ \.\.\.prev, primary_phone: e\.target\.value \}\)\)\}\s+className="[^"]*"\s*\/>/s,
  `<PhoneInput
                                      value={coApplicantForm.primary_phone}
                                      onChange={val => setCoApplicantForm(prev => ({ ...prev, primary_phone: val }))}
                                    />`
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Finished updating primary and co-applicant phone displays and inputs!');
