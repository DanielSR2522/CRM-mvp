import fs from 'fs';
import path from 'path';

function findInFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (
      line.includes('handleSavePolicy') ||
      line.includes('handleAddPolicy') ||
      line.includes('handleEditPolicy') ||
      line.includes('savePolicy') ||
      line.includes('from(\'policies\')') ||
      line.includes('from("policies")')
    ) {
      console.log(`${path.basename(filePath)}:${idx + 1} -> ${line.trim()}`);
    }
  });
}

function run() {
  const dir = path.resolve('src');
  const walk = (d: string) => {
    fs.readdirSync(d).forEach(f => {
      const fp = path.join(d, f);
      if (fs.statSync(fp).isDirectory()) {
        if (!fp.includes('node_modules') && !fp.includes('.next')) walk(fp);
      } else if (fp.endsWith('.ts') || fp.endsWith('.tsx')) {
        findInFile(fp);
      }
    });
  };
  walk(dir);
}

run();
