const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('ANALYSIS OF CALENDAR APPOINTMENTS RLS POLICIES');
console.log('====================================================\n');

// Read all migration files in supabase/migrations
const dir = 'supabase/migrations';
if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir);
  files.forEach((f) => {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    if (content.includes('calendar_appointments')) {
      console.log(`--- Migration File: ${f} ---`);
      const lines = content.split('\n');
      lines.forEach((l, idx) => {
        if (l.toUpperCase().includes('POLICY') || l.includes('calendar_appointments')) {
          console.log(`L${idx + 1}: ${l}`);
        }
      });
    }
  });
}

if (fs.existsSync('migration_calendar_appointments.sql')) {
  console.log('--- Migration File: migration_calendar_appointments.sql ---');
  const content = fs.readFileSync('migration_calendar_appointments.sql', 'utf8');
  const lines = content.split('\n');
  lines.forEach((l, idx) => {
    if (l.toUpperCase().includes('POLICY') || l.includes('calendar_appointments')) {
      console.log(`L${idx + 1}: ${l}`);
    }
  });
}
