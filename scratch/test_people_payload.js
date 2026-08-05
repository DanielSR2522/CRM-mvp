const apiKey = 'd687412e7b53146b2631dc01974ad0a4';

async function testWithPeople(peopleInput) {
  const cleanPlanId = '30252FL0070065';
  const cleanZip = '33324';
  const year = 2026;

  // Resolve county
  const countyUrl = `https://marketplace.api.healthcare.gov/api/v1/counties/by/zip/${cleanZip}?apikey=${apiKey}`;
  const cRes = await fetch(countyUrl);
  const cData = await cRes.json();
  const county = cData.counties[0];

  const searchPeople = Array.isArray(peopleInput) && peopleInput.length > 0
    ? peopleInput.map((p) => ({
        age: Number(p.age || 35),
        gender: p.gender || 'Male',
        uses_tobacco: !!p.uses_tobacco,
        aptc_eligible: true,
        utilization: 'Medium',
        utilization_level: 'Medium',
        relationship: p.relationship || 'Self'
      }))
    : [{ age: 35, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', utilization_level: 'Medium', relationship: 'Self' }];

  const searchPayload = {
    household: {
      income: 60000,
      people: searchPeople
    },
    market: 'Individual',
    place: {
      countyfips: county.fips,
      state: county.state,
      zipcode: cleanZip
    },
    year: year,
    limit: 100,
    offset: 0
  };

  console.log('PAYLOAD:', JSON.stringify(searchPayload, null, 2));

  const searchUrl = `https://marketplace.api.healthcare.gov/api/v1/plans/search?apikey=${apiKey}`;
  const res = await fetch(searchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(searchPayload)
  });

  console.log('HTTP STATUS:', res.status);
  const data = await res.json();
  console.log('DATA TOTAL:', data.total);
  console.log('PLANS COUNT:', data.plans ? data.plans.length : 0);
  if (data.plans) {
    const match = data.plans.find(p => p.id === cleanPlanId);
    console.log('MATCH FOUND:', !!match);
    if (match) console.log('FOUND PLAN:', match.id, match.name);
  } else {
    console.log('ERROR RESPONSE:', data);
  }
}

async function run() {
  console.log('--- TEST 1: Single Applicant ---');
  await testWithPeople([{ age: 35, relationship: 'Self', applying_for_coverage: true }]);

  console.log('\n--- TEST 2: Family Household ---');
  await testWithPeople([
    { age: 35, relationship: 'Self', applying_for_coverage: true },
    { age: 32, relationship: 'Spouse', applying_for_coverage: true },
    { age: 8, relationship: 'Child', applying_for_coverage: true }
  ]);
}

run().catch(console.error);
