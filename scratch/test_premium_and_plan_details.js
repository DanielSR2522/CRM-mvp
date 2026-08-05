const apiKey = 'd687412e7b53146b2631dc01974ad0a4';

async function runTests() {
  const planId = '21525FL0020016';
  const zip = '33324';
  const countyFips = '12011';
  const state = 'FL';
  const year = 2026;

  console.log('=====================================================');
  console.log('1. TESTING PREMIUM CALCULATION WITH COVERED MEMBERS');
  console.log('=====================================================\n');

  // Test 1A: Only Covered Members (2 members: age 27 Self, age 27 Spouse) in plans/search people array
  const searchUrl = `https://marketplace.api.healthcare.gov/api/v1/plans/search?apikey=${apiKey}`;
  const payload2Covered = {
    household: {
      income: 50000,
      people: [
        { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', relationship: 'Self' },
        { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', relationship: 'Spouse' }
      ]
    },
    market: 'Individual',
    place: { countyfips: countyFips, state: state, zipcode: zip },
    year: year,
    limit: 10,
    offset: 0
  };

  let res = await fetch(searchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload2Covered) });
  let data = await res.json();
  let plan2Covered = data.plans ? data.plans.find(p => p.id === planId) : null;
  console.log('2 COVERED MEMBERS PREMIUM (27 Self, 27 Spouse):');
  if (plan2Covered) {
    console.log(`- Full Premium: $${plan2Covered.premium}`);
  }

  // Test 1B: All 3 Members in plans/search people array
  const payload3Covered = {
    household: {
      income: 50000,
      people: [
        { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', relationship: 'Self' },
        { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', relationship: 'Spouse' },
        { age: 16, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', relationship: 'Child' }
      ]
    },
    market: 'Individual',
    place: { countyfips: countyFips, state: state, zipcode: zip },
    year: year,
    limit: 10,
    offset: 0
  };

  res = await fetch(searchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload3Covered) });
  data = await res.json();
  let plan3Covered = data.plans ? data.plans.find(p => p.id === planId) : null;
  console.log('\n3 COVERED MEMBERS PREMIUM (27 Self, 27 Spouse, 16 Child):');
  if (plan3Covered) {
    console.log(`- Full Premium: $${plan3Covered.premium}`);
  }

  // Test 1C: Test APTC Eligibility with 3 household members vs 2
  const eligUrl = `https://marketplace.api.healthcare.gov/api/v1/households/eligibility/estimates?apikey=${apiKey}`;
  const eligPayload3Household = {
    household: {
      income: 50000,
      people: [
        { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', relationship: 'Self' },
        { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', relationship: 'Spouse' },
        { age: 16, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', relationship: 'Child' }
      ]
    },
    place: { countyfips: countyFips, state: state, zipcode: zip },
    year: year
  };
  res = await fetch(eligUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(eligPayload3Household) });
  data = await res.json();
  console.log('\nAPTC ESTIMATE FOR 3 HOUSEHOLD MEMBERS ($50,000 income):', data.estimates ? data.estimates[0]?.aptc : data);

  console.log('\n=====================================================');
  console.log('2. TESTING HEALTHCARE.GOV PLAN DETAILS ENDPOINT');
  console.log('=====================================================\n');

  // Test 2: Fetching GET /plans/{planId} endpoint or /plans/{planId} with params
  const detailUrl1 = `https://marketplace.api.healthcare.gov/api/v1/plans/${planId}?apikey=${apiKey}&year=${year}`;
  res = await fetch(detailUrl1);
  console.log(`GET /plans/${planId} Status:`, res.status);
  if (res.ok) {
    const detailData = await res.json();
    console.log('Plan Detail Response Keys:', Object.keys(detailData));
    if (detailData.plan) {
      console.log('Plan Keys:', Object.keys(detailData.plan));
      console.log('Deductibles:', JSON.stringify(detailData.plan.deductibles, null, 2));
      console.log('MOOPs:', JSON.stringify(detailData.plan.moops, null, 2));
      console.log('Benefits Count:', detailData.plan.benefits ? detailData.plan.benefits.length : 0);
      if (detailData.plan.benefits) {
        console.log('\nSample Benefits (First 5):', JSON.stringify(detailData.plan.benefits.slice(0, 5), null, 2));
      }
    }
  } else {
    console.log('Plan Detail GET error:', await res.text());
  }
}

runTests().catch(console.error);
