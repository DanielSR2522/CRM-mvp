const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');
  const hasKey = lines.some(l => l.startsWith('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY='));
  console.log('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY present in .env.local:', hasKey);
} else {
  console.log('.env.local file does not exist.');
}
