const apiKey = 'd687412e7b53146b2631dc01974ad0a4';
import { normalizeMarketplacePlan } from '../src/lib/marketplace/normalizer.js';

async function testTarget5() {
  const planId = '21525FL0020016';
  const year = 2026;
  const url = `https://marketplace.api.healthcare.gov/api/v1/plans/${planId}?apikey=${apiKey}&year=${year}`;

  const res = await fetch(url);
  const data = await res.json();
  const rawPlan = data.plan;

  // Add dummy premium so normalizer works
  rawPlan.premium = 1022.46;

  const normalized = normalizeMarketplacePlan(rawPlan, 861.00);

  console.log('=== REGRESSION CHECK — FINANCIAL ESTIMATES ===');
  console.log('Full Premium:', normalized.premiumFull, '(Expected: 1022.46)');
  console.log('APTC:', normalized.taxCredit, '(Expected: 861)');
  console.log('Net Premium:', normalized.premiumNet, '(Expected: 161.46)');
  console.log('Ind Deductible:', normalized.deductibleIndividual, '(Expected: 3000)');
  console.log('Fam Deductible:', normalized.deductibleFamily, '(Expected: 6000)');
  console.log('Ind MOOP:', normalized.oopMaxIndividual, '(Expected: 9950)');
  console.log('Fam MOOP:', normalized.oopMaxFamily, '(Expected: 19900)');

  console.log('\n=== REGRESSION CHECK — EXISTING WORKING BENEFITS ===');
  const checkNames = [
    'Primary Care Visit',
    'Specialist Visit',
    'Urgent Care',
    'Emergency Room',
    'Mental Health Outpatient',
    'Generic Drugs'
  ];
  checkNames.forEach(name => {
    const b = normalized.benefits.find(item => item.serviceName === name);
    console.log(`- ${name.padEnd(25)}: ${b ? b.individualValue : 'NOT FOUND'}`);
  });

  console.log('\n=== 5 TARGET BENEFIT ROWS CHECK ===');
  const target5Names = [
    'Telehealth',
    'Diagnostic Imaging',
    'CT Scan',
    'PET Scan',
    'Mail Order'
  ];
  target5Names.forEach(name => {
    const b = normalized.benefits.find(item => item.serviceName === name);
    console.log(`- ${name.padEnd(25)}: ${b ? b.individualValue : 'NOT FOUND'}`);
    if (b && b.notes) console.log(`  Notes: ${b.notes}`);
  });
}

testTarget5().catch(console.error);
