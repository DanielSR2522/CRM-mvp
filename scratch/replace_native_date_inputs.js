const fs = require('fs');
const path = require('path');

const clientPagePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(clientPagePath, 'utf-8');

// Replace both occurrences of native date input for immigration_expiration_date
const regex = /<input\s+type="date"\s+value=\{personalForm\.immigration_expiration_date\}\s+onChange=\{e => setPersonalForm\(prev => \(\{ \.\.\.prev, immigration_expiration_date: e\.target\.value \}\)\)\}\s+className="[^"]*"\s*\/>/g;

const replacement = `<DatePicker
                                      value={personalForm.immigration_expiration_date}
                                      onChange={iso => setPersonalForm(prev => ({ ...prev, immigration_expiration_date: iso || '' }))}
                                      placeholder="MM/DD/YYYY"
                                    />`;

if (regex.test(content)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync(clientPagePath, content, 'utf-8');
  console.log('Successfully replaced native type="date" inputs with DatePicker in client page.tsx!');
} else {
  console.log('Regex match failed, doing line search...');
}
