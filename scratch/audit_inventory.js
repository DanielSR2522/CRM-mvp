const fs = require('fs');
const path = require('path');

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!fullPath.includes('node_modules') && !fullPath.includes('.next')) {
        getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
        arrayOfFiles.push(fullPath);
      }
    }
  });
  return arrayOfFiles;
}

const srcDir = path.join(__dirname, '../src');
const files = getAllFiles(srcDir);

const inventory = {
  editButtons: [],
  isEditingState: [],
  calendarFiles: []
};

files.forEach(file => {
  const relPath = path.relative(path.join(__dirname, '..'), file);
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trim = line.trim();

    if (
      trim.includes('Edit') ||
      trim.includes('Edit Info') ||
      trim.includes('Edit Client') ||
      trim.includes('Edit Profile') ||
      trim.includes('Edit Policy') ||
      trim.includes('Edit Details')
    ) {
      if (trim.includes('button') || trim.includes('<button') || trim.includes('onClick')) {
        inventory.editButtons.push({ file: relPath, line: lineNum, text: trim });
      }
    }

    if (trim.includes('isEditing') || trim.includes('setIsEditing') || trim.includes('editingField')) {
      inventory.isEditingState.push({ file: relPath, line: lineNum, text: trim });
    }
  });

  if (relPath.includes('calendar')) {
    inventory.calendarFiles.push(relPath);
  }
});

console.log('=== INVENTORY AUDIT RESULTS ===');
console.log(`Edit buttons found: ${inventory.editButtons.length}`);
console.log(`isEditing state instances: ${inventory.isEditingState.length}`);
console.log(`Calendar files found: ${inventory.calendarFiles.length}`);

fs.writeFileSync(path.join(__dirname, 'inventory_audit.json'), JSON.stringify(inventory, null, 2));
