import fs from 'fs';
import path from 'path';

function walkDir(dir: string, fileList: string[] = []) {
  fs.readdirSync(dir).forEach(file => {
    const fp = path.join(dir, file);
    if (fs.statSync(fp).isDirectory()) {
      if (!fp.includes('node_modules') && !fp.includes('.next')) walkDir(fp, fileList);
    } else if (fp.endsWith('.ts') || fp.endsWith('.tsx')) {
      fileList.push(fp);
    }
  });
  return fileList;
}

function searchAllWrites() {
  const files = walkDir(path.resolve('src'));
  console.log('=== SEARCHING ALL DB WRITE / UPDATE CALLS ===\n');

  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (line.includes('.from(') && (line.includes('update') || line.includes('upsert') || line.includes('insert'))) {
        console.log(`${path.relative(process.cwd(), file)}:${i + 1} -> ${line.trim()}`);
      }
    });
  });
}

searchAllWrites();
