const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0,i).trim()] = line.slice(i+1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function auditPaymentSchema() {
  console.log('====================================================');
  console.log('EMPIRICAL AUDIT: PAYMENT & PERSONAL INFO SCHEMA');
  console.log('====================================================\n');

  // 1. Search DB table names
  const candidateTables = [
    'client_personal_information',
    'client_residence_information',
    'client_income_information',
    'client_payment_information',
    'client_billing_information',
    'client_payments',
    'payment_information',
    'health_policies',
    'life_policies',
    'policies'
  ];

  console.log('1. DB Candidate Table Audit:');
  for (const t of candidateTables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (!error) {
      console.log(`   - Table '${t}': ✅ EXISTS (${data.length > 0 ? Object.keys(data[0]).join(', ') : 'Empty'})`);
    } else {
      console.log(`   - Table '${t}': ❌ NOT FOUND (${error.message})`);
    }
  }

  // 2. Search SQL files for payment, bank, card, pgcrypto, vault
  console.log('\n2. Repository Search for Payment / Encryption / PGCrypto:');
  const searchTerms = ['payment', 'bank', 'routing', 'card_number', 'pgcrypto', 'vault', 'encrypt', 'decrypt'];
  const sqlFiles = [];
  
  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(f => {
      const p = `${dir}/${f}`;
      if (fs.statSync(p).isDirectory()) {
        if (f !== 'node_modules' && f !== '.next' && f !== '.git') scanDir(p);
      } else if (p.endsWith('.sql') || p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js')) {
        const text = fs.readFileSync(p, 'utf8');
        searchTerms.forEach(term => {
          if (text.toLowerCase().includes(term)) {
            // Log matching context
            text.split('\n').forEach((line, idx) => {
              if (line.toLowerCase().includes(term) && !line.includes('//') && !line.includes('*')) {
                // filter out noise
                if (line.includes('CREATE TABLE') || line.includes('pgcrypto') || line.includes('vault') || line.includes('encrypt') || line.includes('bank') || line.includes('routing')) {
                  console.log(`   [${p}:${idx+1}]: ${line.trim()}`);
                }
              }
            });
          }
        });
      }
    });
  }

  scanDir('.');
}

auditPaymentSchema().catch(err => {
  console.error('Audit script error:', err);
  process.exit(1);
});
