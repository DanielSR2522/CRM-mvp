const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/lib/auth/businessLines.ts');
if (fs.existsSync(file)) {
  console.log(fs.readFileSync(file, 'utf8'));
} else {
  console.log('File not found');
}
