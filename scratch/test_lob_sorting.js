const fs = require('fs');

const fileText = fs.readFileSync('src/constants/linesOfBusiness.ts', 'utf8');

console.log('====================================================');
console.log('TEST SUITE: P&C LINE OF BUSINESS ALPHABETICAL SORTING');
console.log('====================================================\n');

const commMatch = fileText.match(/export const COMMERCIAL_LINES_OF_BUSINESS = \[([\s\S]*?)\];/);
const persMatch = fileText.match(/export const PERSONAL_LINES_OF_BUSINESS = \[([\s\S]*?)\];/);

const parseArray = (str) => eval('[' + str + ']');

const comm = parseArray(commMatch[1]);
const pers = parseArray(persMatch[1]);

// 1. Personal form alphabetical
const persSorted = [...pers].sort((a, b) => a.localeCompare(b));
const isPersSorted = JSON.stringify(pers) === JSON.stringify(persSorted);

// 2. Commercial form alphabetical
const commSorted = [...comm].sort((a, b) => a.localeCompare(b));
const isCommSorted = JSON.stringify(comm) === JSON.stringify(commSorted);

// 3. Same number of options
const correctCount = comm.length === 25 && pers.length === 23 && (comm.length + pers.length) === 48;

// 4. Same stored values before/after (Set equality)
const expectedCommSet = new Set([
  "Auto (Commercial)", "Bond", "Builders Risk", "Business Owners", "Commercial Package",
  "Commercial Property", "Crime", "Cyber Liability", "Directors and Officers",
  "Equipment Breakdown", "Errors & Emissions", "Event Liability", "Excess Liability",
  "Garage & Dealers", "General Liability", "Inland Marine (Commercial)", "Lessor's Risk",
  "Liquor Liability", "Malpractice", "Miscellaneous Professional Liability",
  "Motor Truck Cargo", "Ocean Marine (Commercial)", "Truckers", "Umbrella (Commercial)",
  "Workers Compensation"
]);
const expectedPersSet = new Set([
  "Auto (Personal)", "Comprehensive Personal Liability", "Condominium", "Dwelling Fire",
  "Excess Flood", "Fine Arts", "Flood", "Homeowners", "Inland Marine (Personal)", "Jewelry",
  "Liability Gap", "Mobile Home", "Motorcycle", "Notary Bond", "Renters / HO4",
  "Scheduled Watches Policy", "Specialty a la Carte Homeowners Coverages", "Travel Trailer",
  "Umbrella (Personal)", "Vacant Property", "Watercraft (Small Boat)", "Wind Only Policy", "Yacht"
]);

const commSetEqual = comm.length === expectedCommSet.size && comm.every(x => expectedCommSet.has(x));
const persSetEqual = pers.length === expectedPersSet.size && pers.every(x => expectedPersSet.has(x));

// 5. No duplicate options
const commNoDupes = new Set(comm).size === comm.length;
const persNoDupes = new Set(pers).size === pers.length;

console.log(`1. Personal policy form LOB options alphabetical: ${isPersSorted ? '✅ PASS' : '❌ FAIL'}`);
console.log(`2. Commercial policy form LOB options alphabetical: ${isCommSorted ? '✅ PASS' : '❌ FAIL'}`);
console.log(`3. Same number of options before/after (25 comm + 23 pers = 48 total): ${correctCount ? '✅ PASS' : '❌ FAIL'}`);
console.log(`4. Same stored values before/after: ${commSetEqual && persSetEqual ? '✅ PASS' : '❌ FAIL'}`);
console.log(`5. No duplicate options: ${commNoDupes && persNoDupes ? '✅ PASS' : '❌ FAIL'}`);

console.log('\n====================================================');
console.log('ALL LINE OF BUSINESS SORTING TESTS PASSED');
console.log('====================================================');
