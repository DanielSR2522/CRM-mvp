const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  const oldContent = execSync('git show HEAD~10:src/app/clients/[id]/page.tsx', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024
  });

  fs.writeFileSync(path.join(__dirname, 'old_page.tsx'), oldContent);
  console.log('Successfully saved old_page.tsx!');
} catch (err) {
  console.error('Git show failed, trying HEAD~5:', err.message);
  try {
    const oldContent = execSync('git show HEAD~5:src/app/clients/[id]/page.tsx', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    });
    fs.writeFileSync(path.join(__dirname, 'old_page.tsx'), oldContent);
    console.log('Successfully saved old_page.tsx from HEAD~5!');
  } catch (e) {
    console.error('Git show HEAD~5 failed too:', e.message);
  }
}
