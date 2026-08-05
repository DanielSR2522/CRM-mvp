const apiKey = 'd687412e7b53146b2631dc01974ad0a4';

async function testExactClientPayload() {
  const cleanPlanId = '30252FL0070065';
  const zip = '33324';
  const countyFips = '12011';
  const state = 'FL';
  const year = 2026;

  // Exact people array sent from browser/route:
  // Member 1: age 27, Self, applying_for_coverage: true
  // Member 2: age 27, Spouse, applying_for_coverage: true
  // Member 3: age 16, Daughter (or Child), applying_for_coverage: false

  console.log('=== TEST A: Sending all 3 members (including Member 3 with applying_for_coverage: false / aptc_eligible) ===');

  // Let's test how route.ts currently constructs people array:
  // In route.ts:
  // const searchPeople = people.map(p => ({
  //   age: Number(p.age || 35),
  //   gender: p.gender || 'Male',
  //   uses_tobacco: !!p.uses_tobacco,
  //   aptc_eligible: true, <--- Wait! Is aptc_eligible: true sent for non-covered members or does Healthcare.gov reject / return 0 plans if aptc_eligible: true or aptc_eligible: false? Or is aptc_eligible parameter handled differently?
  //   utilization: 'Medium',
  //   utilization_level: 'Medium',
  //   relationship: p.relationship || 'Self'
  // }))

  const peoplePayloadAll3 = [
    { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', utilization_level: 'Medium', relationship: 'Self', aptc_eligible: true },
    { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', utilization_level: 'Medium', relationship: 'Spouse', aptc_eligible: true },
    { age: 16, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', utilization_level: 'Medium', relationship: 'Child', aptc_eligible: true }
  ];

  const searchUrl = `https://marketplace.api.healthcare.gov/api/v1/plans/search?apikey=${apiKey}`;

  const payloadAll3 = {
    household: { income: 50000, people: peoplePayloadAll3 },
    market: 'Individual',
    place: { countyfips: countyFips, state: state, zipcode: zip },
    year: year,
    limit: 10,
    offset: 0
  };

  console.log('OUTBOUND PAYLOAD (All 3 members):', JSON.stringify(payloadAll3, null, 2));

  let res = await fetch(searchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payloadAll3)
  });

  console.log('HTTP STATUS:', res.status);
  let data = await res.json();
  console.log('RAW TOP LEVEL KEYS:', Object.keys(data));
  console.log('DATA TOTAL:', data.total);
  console.log('DATA PLANS TYPE & LENGTH:', Array.isArray(data.plans) ? data.plans.length : typeof data.plans);
  if (!res.ok) console.log('ERROR CONTENT:', data);

  console.log('\n=== TEST B: Sending ONLY covered applicants (2 members: age 27 Self, age 27 Spouse) ===');
  const peoplePayloadCoveredOnly = [
    { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', utilization_level: 'Medium', relationship: 'Self' },
    { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', utilization_level: 'Medium', relationship: 'Spouse' }
  ];

  const payloadCoveredOnly = {
    household: { income: 50000, people: peoplePayloadCoveredOnly },
    market: 'Individual',
    place: { countyfips: countyFips, state: state, zipcode: zip },
    year: year,
    limit: 10,
    offset: 0
  };

  res = await fetch(searchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payloadCoveredOnly)
  });

  console.log('HTTP STATUS:', res.status);
  data = await res.json();
  console.log('DATA TOTAL:', data.total);
  console.log('DATA PLANS LENGTH:', data.plans ? data.plans.length : 0);

  console.log('\n=== TEST C: Testing aptc_eligible / aptc / applying_for_coverage parameters ===');
  // What if Healthcare.gov API expects 'aptc_eligible' or 'aptc' or 'apply' or 'is_applicant'? Or what if relationship 'Daughter' vs 'Child' is rejected?
  const peoplePayloadDaughter = [
    { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', utilization_level: 'Medium', relationship: 'Self' },
    { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', utilization_level: 'Medium', relationship: 'Spouse' },
    { age: 16, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', utilization_level: 'Medium', relationship: 'Daughter' }
  ];
  const payloadDaughter = {
    household: { income: 50000, people: peoplePayloadDaughter },
    market: 'Individual',
    place: { countyfips: countyFips, state: state, zipcode: zip },
    year: year,
    limit: 10,
    offset: 0
  };
  res = await fetch(searchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payloadDaughter)
  });
  console.log('HTTP STATUS WITH "Daughter":', res.status);
  data = await res.json();
  console.log('DATA WITH "Daughter":', res.status === 200 ? `Total: ${data.total}, Plans: ${data.plans?.length}` : data);
}

testExactClientPayload().catch(console.error);
