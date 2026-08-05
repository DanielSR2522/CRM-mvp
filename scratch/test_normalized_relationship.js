const apiKey = 'd687412e7b53146b2631dc01974ad0a4';

function mapRelationshipToApi(rel) {
  if (!rel) return 'Self';
  const r = rel.trim();
  if (r === 'Self') return 'Self';
  if (r === 'Spouse') return 'Spouse';
  if (['Son', 'Daughter', 'Child', 'Stepchild'].includes(r)) return 'Child';
  return 'Other';
}

async function testWithNormalizedRelationship() {
  const cleanPlanId = '30252FL0070065';
  const zip = '33324';
  const countyFips = '12011';
  const state = 'FL';
  const year = 2026;

  // Exact client members:
  // Member 1: age 27, Self
  // Member 2: age 27, Spouse
  // Member 3: age 16, Daughter (mapped to Child)
  const clientMembers = [
    { age: 27, relationship: 'Self', applying_for_coverage: true },
    { age: 27, relationship: 'Spouse', applying_for_coverage: true },
    { age: 16, relationship: 'Daughter', applying_for_coverage: false }
  ];

  const searchPeople = clientMembers.map(p => ({
    age: Number(p.age),
    gender: 'Male',
    uses_tobacco: false,
    aptc_eligible: true,
    utilization: 'Medium',
    utilization_level: 'Medium',
    relationship: mapRelationshipToApi(p.relationship)
  }));

  console.log('SEARCH PEOPLE:', JSON.stringify(searchPeople, null, 2));

  const searchUrl = `https://marketplace.api.healthcare.gov/api/v1/plans/search?apikey=${apiKey}`;
  const payload = {
    household: { income: 50000, people: searchPeople },
    market: 'Individual',
    place: { countyfips: countyFips, state: state, zipcode: zip },
    year: year,
    limit: 10,
    offset: 0
  };

  const res = await fetch(searchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });

  console.log('HTTP STATUS:', res.status);
  const data = await res.json();
  console.log('DATA TOTAL:', data.total);
  console.log('RETURNED PLANS COUNT:', data.plans ? data.plans.length : 0);

  if (data.plans) {
    const match = data.plans.find(p => p.id === cleanPlanId);
    console.log('EXACT MATCH FOUND (30252FL0070065):', !!match);
    if (match) console.log('FOUND PLAN NAME:', match.name);
  }

  // Also test 21525FL0020016
  console.log('\n--- TESTING 21525FL0020016 WITH PAGINATION ---');
  let offset = 0;
  let matchedPlanB = null;
  let page = 0;
  while (offset < 200) {
    payload.offset = offset;
    page++;
    const resB = await fetch(searchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const dataB = await resB.json();
    const plansB = dataB.plans || [];
    console.log(`Page ${page} (offset ${offset}): Returned ${plansB.length} plans (Total: ${dataB.total})`);
    if (plansB.length === 0) break;
    matchedPlanB = plansB.find(p => p.id === '21525FL0020016');
    if (matchedPlanB) {
      console.log(`EXACT MATCH FOUND FOR 21525FL0020016 on Page ${page}! Name:`, matchedPlanB.name);
      break;
    }
    if (offset + plansB.length >= dataB.total) break;
    offset += plansB.length;
  }
}

testWithNormalizedRelationship().catch(console.error);
