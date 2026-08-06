const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../src/components/health/HealthPolicyForm.tsx'), 'utf8');
const lines = content.split('\n');

lines.forEach((l, idx) => {
  if (l.includes('Active') || l.includes('isActive') || l.includes('active')) {
    if (l.includes('label') || l.includes('Label') || l.includes('span') || l.includes('checkbox') || l.includes('Yes') || l.includes('No') || l.includes('Enrolled')) {
      console.log(`L${idx + 1}: ${l}`);
    }
  }
});
