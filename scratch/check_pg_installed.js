const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

console.log('Dependencies:', Object.keys(pkg.dependencies || {}));
console.log('DevDependencies:', Object.keys(pkg.devDependencies || {}));
