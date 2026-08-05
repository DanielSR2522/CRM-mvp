const apiKey = 'd687412e7b53146b2631dc01974ad0a4';

function mapRelationshipToApi(rel) {
  if (!rel) return 'Self';
  const r = rel.trim();
  if (r === 'Self') return 'Self';
  if (r === 'Spouse') return 'Spouse';
  if (['Son', 'Daughter', 'Child', 'Stepchild'].includes(r)) return 'Child';
  return 'Other';
}

async function testCompleteRouteFlow(testName, clientPeople, income) {
  const planId = '21525FL0020016';
  const zip = '33324';
  const countyFips = '12011';
  const state = 'FL';
  const year = 2026;

  console.log(`\n=====================================================`);
  console.log(`RUNNING ${testName}`);
  console.log(`=====================================================`);

  const coveredMembers = clientPeople.filter(p => p.coverage !== false);
  const taxHouseholdMembers = clientPeople;

  console.log(`- Tax Household Count: ${taxHouseholdMembers.length} (${taxHouseholdMembers.map(p => `${p.age} ${p.relationship}`).join(', ')})`);
  console.log(`- Covered Members Count: ${coveredMembers.length} (${coveredMembers.map(p => `${p.age} ${p.relationship}`).join(', ')})`);

  // Build searchPeople for premium search (only covered members!)
  const searchPeople = (coveredMembers.length > 0 ? coveredMembers : taxHouseholdMembers).map(p => ({
    age: Number(p.age || 35),
    gender: 'Male',
    uses_tobacco: false,
    aptc_eligible: true,
    utilization: 'Medium',
    utilization_level: 'Medium',
    relationship: mapRelationshipToApi(p.relationship)
  }));

  const searchUrl = `https://marketplace.api.healthcare.gov/api/v1/plans/search?apikey=${apiKey}`;
  const searchPayload = {
    household: { income: income, people: searchPeople },
    market: 'Individual',
    place: { countyfips: countyFips, state: state, zipcode: zip },
    year: year,
    limit: 10,
    offset: 0
  };

  let matchedPlan = null;
  let offset = 0;

  while (offset < 200) {
    searchPayload.offset = offset;
    const searchRes = await fetch(searchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(searchPayload)
    });
    const searchData = await searchRes.json();
    const plans = searchData.plans || [];
    if (plans.length === 0) break;
    matchedPlan = plans.find(p => p.id === planId);
    if (matchedPlan) break;
    if (offset + plans.length >= searchData.total) break;
    offset += plans.length;
  }

  if (!matchedPlan) {
    console.log('ERROR: Matched plan not found');
    return;
  }

  const fullPremium = matchedPlan.premium;
  console.log(`\n- Full Plan Cost (from /plans/search for ${coveredMembers.length} covered members): $${fullPremium}`);

  // Calculate APTC for full tax household (all 3 members!)
  const eligPeople = taxHouseholdMembers.map(p => ({
    age: Number(p.age || 35),
    gender: 'Male',
    uses_tobacco: false,
    aptc_eligible: true,
    utilization: 'Medium',
    utilization_level: 'Medium',
    relationship: mapRelationshipToApi(p.relationship)
  }));

  const eligUrl = `https://marketplace.api.healthcare.gov/api/v1/households/eligibility/estimates?apikey=${apiKey}`;
  const eligRes = await fetch(eligUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      household: { income: income, people: eligPeople },
      place: { countyfips: countyFips, state: state, zipcode: zip },
      year: year
    })
  });

  const eligData = await eligRes.json();
  const aptcEstimate = eligData.estimates ? eligData.estimates[0]?.aptc : 0;
  console.log(`- Calculated APTC (for ${taxHouseholdMembers.length} tax household members, $${income} income): $${aptcEstimate}`);

  const netPremium = Math.max(0, fullPremium - aptcEstimate);
  console.log(`- Final Monthly Premium: $${netPremium.toFixed(2)}`);

  // Fetch Full Plan Details from GET /plans/{planId}
  const detailUrl = `https://marketplace.api.healthcare.gov/api/v1/plans/${planId}?apikey=${apiKey}&year=${year}`;
  const detailRes = await fetch(detailUrl);
  const detailData = await detailRes.json();
  const fullPlan = detailData.plan;

  console.log(`\n- GET /plans/${planId} Benefits Count: ${fullPlan.benefits ? fullPlan.benefits.length : 0}`);

  // Extract Deductibles
  const famDed = fullPlan.deductibles?.find(d => d.family || d.family_cost === 'Family');
  const indDed = fullPlan.deductibles?.find(d => d.individual || d.family_cost === 'Individual');
  console.log(`- Individual Deductible: $${indDed?.amount}`);
  console.log(`- Family Deductible: $${famDed?.amount}`);

  // Extract MOOPs
  const famMoop = fullPlan.moops?.find(m => m.family || m.family_cost === 'Family');
  const indMoop = fullPlan.moops?.find(m => m.individual || m.family_cost === 'Individual');
  console.log(`- Individual Out-Of-Pocket Max: $${indMoop?.amount}`);
  console.log(`- Family Out-Of-Pocket Max: $${famMoop?.amount}`);
}

async function runAll() {
  const peopleTestA = [
    { age: 27, relationship: 'Self', coverage: true },
    { age: 27, relationship: 'Spouse', coverage: true },
    { age: 16, relationship: 'Daughter', coverage: false }
  ];

  const peopleTestB = [
    { age: 27, relationship: 'Self', coverage: true },
    { age: 27, relationship: 'Spouse', coverage: true },
    { age: 16, relationship: 'Daughter', coverage: true }
  ];

  await testCompleteRouteFlow('TEST A (2 Covered: Applicant + Spouse, Daughter Coverage: No)', peopleTestA, 50000);
  await testCompleteRouteFlow('TEST B (3 Covered: Applicant + Spouse + Daughter, Daughter Coverage: Yes)', peopleTestB, 50000);
}

runAll().catch(console.error);
