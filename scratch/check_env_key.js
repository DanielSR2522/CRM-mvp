const fs = require('fs');
const path = require('path');

const envLocalPath = path.join(__dirname, '../.env.local');
const envPath = path.join(__dirname, '../.env');

let envLocalExists = fs.existsSync(envLocalPath);
let envExists = fs.existsSync(envPath);

console.log('.env.local exists:', envLocalExists);
console.log('.env exists:', envExists);

if (envLocalExists) {
  const content = fs.readFileSync(envLocalPath, 'utf-8');
  const lines = content.split('\n');
  lines.forEach(line => {
    if (line.includes('GOOGLE_MAPS')) {
      const parts = line.split('=');
      const val = parts[1] ? parts[1].trim() : '';
      console.log(`${parts[0]}: ${val ? 'PRESENT (len: ' + val.length + ')' : 'EMPTY'}`);
    }
  });
}
