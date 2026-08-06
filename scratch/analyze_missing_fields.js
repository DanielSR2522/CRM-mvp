const fs = require('fs');
const path = require('path');

const oldPath = path.join(__dirname, 'old_page.tsx');
const currentPath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');

const oldContent = fs.readFileSync(oldPath, 'utf-8');
const currentContent = fs.readFileSync(currentPath, 'utf-8');

// Extract personal-info tab section from old file
const oldTabStart = oldContent.indexOf("activeTab === 'personal-info'");
const oldTabEnd = oldContent.indexOf("activeTab === 'documents'");
const oldSection = oldContent.substring(oldTabStart, oldTabEnd);

// Extract personal-info tab section from current file
const curTabStart = currentContent.indexOf("activeTab === 'personal-info'");
const curTabEnd = currentContent.indexOf("activeTab === 'documents'");
const curSection = currentContent.substring(curTabStart, curTabEnd);

console.log('=== OLD PERSONAL INFO LABELS ===');
const oldLabels = (oldSection.match(/<label[^>]*>(.*?)<\/label>/gs) || []).map(l => l.replace(/<[^>]+>/g, '').trim());
console.log(oldLabels);

console.log('\n=== CURRENT PERSONAL INFO LABELS ===');
const curLabels = (curSection.match(/<label[^>]*>(.*?)<\/label>/gs) || []).map(l => l.replace(/<[^>]+>/g, '').trim());
console.log(curLabels);

console.log('\n=== MISSING LABELS ===');
const missing = oldLabels.filter(l => !curLabels.includes(l));
console.log(missing);
