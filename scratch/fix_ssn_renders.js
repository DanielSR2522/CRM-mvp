const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Ensure imports
if (!content.includes("import SSNInput")) {
  content = content.replace(
    "import DatePicker from '@/components/ui/DatePicker';",
    "import DatePicker from '@/components/ui/DatePicker';\nimport SSNInput from '@/components/common/SSNInput';\nimport PhoneInput from '@/components/common/PhoneInput';\nimport { formatSSN } from '@/lib/formatters/ssn';\nimport { formatUSPhone } from '@/lib/formatters/phone';"
  );
}

// Replace Primary SSN display & edit input
const primSearch = `<span className="font-semibold text-slate-800 block min-h-[20px]">{personalForm.ssn || '-'}</span>`;
const primReplace = `<span className="font-semibold text-slate-800 block min-h-[20px]">{formatSSN(personalForm.ssn) || '-'}</span>`;

const primInputSearch = `<input
                                  type="text"
                                  value={personalForm.ssn}
                                  onChange={e => setPersonalForm(prev => ({ ...prev, ssn: e.target.value }))}
                                  placeholder="e.g. 000-00-0000"
                                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                                />`;

const primInputReplace = `<SSNInput
                                  value={personalForm.ssn}
                                  onChange={val => setPersonalForm(prev => ({ ...prev, ssn: val }))}
                                />`;

// Replace Co-Applicant SSN display & edit input
const coSearch = `<span className="font-semibold text-slate-800 block min-h-[20px]">{coApplicantInfo?.ssn || '-'}</span>`;
const coReplace = `<span className="font-semibold text-slate-800 block min-h-[20px]">{formatSSN(coApplicantInfo?.ssn) || '-'}</span>`;

const coInputSearch = `<input
                                      type="text"
                                      value={coApplicantForm.ssn}
                                      onChange={e => setCoApplicantForm(prev => ({ ...prev, ssn: e.target.value }))}
                                      placeholder="e.g. 000-00-0000"
                                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                                    />`;

const coInputReplace = `<SSNInput
                                      value={coApplicantForm.ssn}
                                      onChange={val => setCoApplicantForm(prev => ({ ...prev, ssn: val }))}
                                    />`;

content = content.replace(primSearch, primReplace);
content = content.replace(coSearch, coReplace);
content = content.replace(primInputSearch, primInputReplace);
content = content.replace(coInputSearch, coInputReplace);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Successfully updated primary and co-applicant SSN display and inputs in client detail page!');
