const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../src/components/life');
const files = fs.readdirSync(dir);

files.forEach(file => {
  if (file.endsWith('.ts') || file.endsWith('.tsx')) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    if (content.includes('type="date"') || content.includes("type='date'")) {
      console.log(`Found native date input in: ${file}`);
    }
  }
});
