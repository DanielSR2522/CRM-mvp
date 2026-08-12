const fs = require('fs');
const crypto = require('crypto');

const envPath = '.env.local';
let text = fs.readFileSync(envPath, 'utf8');

if (!text.includes('PAYMENT_DATA_ENCRYPTION_KEY')) {
  const newKey = crypto.randomBytes(32).toString('base64');
  text += `\nPAYMENT_DATA_ENCRYPTION_KEY="${newKey}"\n`;
  fs.writeFileSync(envPath, text, 'utf8');
  console.log('Added PAYMENT_DATA_ENCRYPTION_KEY to .env.local');
} else {
  console.log('PAYMENT_DATA_ENCRYPTION_KEY already exists in .env.local');
}
