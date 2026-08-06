const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    if (line.includes('URL') || line.includes('POSTGRES') || line.includes('DATABASE') || line.includes('SUPABASE')) {
      const parts = line.split('=');
      console.log(`${parts[0].trim()}: PRESENT`);
    }
  });
}
