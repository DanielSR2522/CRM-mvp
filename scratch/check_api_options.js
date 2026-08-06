const fs = require('fs');
const path = require('path');

const dtsPath = path.join(__dirname, '../node_modules/@googlemaps/js-api-loader/dist/index.d.ts');
if (fs.existsSync(dtsPath)) {
  console.log(fs.readFileSync(dtsPath, 'utf-8'));
} else {
  console.log('d.ts not found at index.d.ts, searching...');
}
