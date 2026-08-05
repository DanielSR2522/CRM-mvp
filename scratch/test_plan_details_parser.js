const apiKey = 'd687412e7b53146b2631dc01974ad0a4';

async function testFullDetailParsing() {
  const planId = '21525FL0020016';
  const year = 2026;
  const url = `https://marketplace.api.healthcare.gov/api/v1/plans/${planId}?apikey=${apiKey}&year=${year}`;

  const res = await fetch(url);
  const data = await res.json();
  const rawPlan = data.plan;

  console.log('--- RAW PLAN METADATA ---');
  console.log('ID:', rawPlan.id);
  console.log('Name:', rawPlan.name);
  console.log('Carrier:', rawPlan.issuer?.name);
  console.log('Deductibles Count:', rawPlan.deductibles?.length);
  console.log('MOOPs Count:', rawPlan.moops?.length);
  console.log('Benefits Count:', rawPlan.benefits?.length);

  // Inspect Deductibles
  const familyDeductible = rawPlan.deductibles?.find(d => d.family || d.family_cost === 'Family');
  const indDeductible = rawPlan.deductibles?.find(d => d.individual || d.family_cost === 'Individual');
  console.log('\n--- DEDUCTIBLES ---');
  console.log('Individual Deductible:', indDeductible ? indDeductible.amount : null);
  console.log('Family Deductible:', familyDeductible ? familyDeductible.amount : null);

  // Inspect MOOPs
  const familyMoop = rawPlan.moops?.find(m => m.family || m.family_cost === 'Family');
  const indMoop = rawPlan.moops?.find(m => m.individual || m.family_cost === 'Individual');
  console.log('\n--- MOOPs ---');
  console.log('Individual MOOP:', indMoop ? indMoop.amount : null);
  console.log('Family MOOP:', familyMoop ? familyMoop.amount : null);

  // Key Target Benefits
  const targetTypes = [
    'PRIMARY_CARE_VISIT_TO_TREAT_AN_INJURY_OR_ILLNESS',
    'SPECIALIST_VISIT',
    'URGENT_CARE_CENTERS_OR_FACILITIES',
    'EMERGENCY_ROOM_SERVICES',
    'OUTPATIENT_MENTAL_HEALTH_OR_SUBSTANCE_USE',
    'GENERIC_DRUGS'
  ];

  console.log('\n--- TARGET BENEFITS COST SHARINGS ---');
  targetTypes.forEach(t => {
    const b = rawPlan.benefits?.find(item => item.type === t || item.name?.toUpperCase().includes(t));
    if (b) {
      const inNetwork = b.cost_sharings?.find(cs => cs.network_tier === 'In-Network');
      console.log(`\nBenefit: ${b.name} (${b.type})`);
      console.log(`  Covered: ${b.covered}`);
      console.log(`  In-Network Cost Sharing:`, inNetwork);
    } else {
      console.log(`\nBenefit Type ${t}: NOT FOUND DIRECTLY BY TYPE. Searching by name...`);
    }
  });
}

testFullDetailParsing().catch(console.error);
