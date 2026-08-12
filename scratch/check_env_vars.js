const fs = require('fs');

console.log('ENV keys in process.env:');
Object.keys(process.env).forEach(k => {
  if (k.includes('DB') || k.includes('URL') || k.includes('POSTGRES') || k.includes('SUPABASE')) {
    console.log(`  ${k} = ${process.env[k].substring(0, 20)}...`);
  }
});
