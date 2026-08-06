const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/contexts/BusinessLinesContext.tsx');
if (fs.existsSync(file)) {
  console.log(fs.readFileSync(file, 'utf8'));
} else {
  console.log('BusinessLinesContext not found at expected path.');
}
