import fs from 'fs';
import path from 'path';

function searchDirectory(dirPath: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (!filePath.includes('node_modules') && !filePath.includes('.next') && !filePath.includes('.git')) {
        searchDirectory(filePath, fileList);
      }
    } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function analyzeWrites() {
  const srcDir = path.resolve('src');
  const files = searchDirectory(srcDir);

  console.log('=== SEARCHING FOR CLIENTS & PERSONAL INFO UPDATE/UPSERT CALLS ===\n');

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(process.cwd(), file);

    const matches: string[] = [];
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (
        (line.includes("from('clients')") || line.includes('from("clients")') || line.includes("from('client_personal_information')") || line.includes('from("client_personal_information")')) &&
        (line.includes('.update') || line.includes('.upsert') || line.includes('.insert'))
      ) {
        matches.push(`Line ${index + 1}: ${line.trim()}`);
      }
      // Also check surrounding 3 lines if update or upsert is on next line
      if (line.includes('.update(') || line.includes('.upsert(')) {
        if (lines[index - 1]?.includes('clients') || lines[index - 1]?.includes('client_personal_information')) {
          matches.push(`Line ${index + 1}: ${line.trim()}`);
        }
      }
    });

    if (matches.length > 0) {
      console.log(`📁 File: ${relativePath}`);
      matches.forEach((m) => console.log(`   ${m}`));
      console.log('');
    }
  }
}

analyzeWrites();
