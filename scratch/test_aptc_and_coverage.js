const apiKey = 'd687412e7b53146b2631dc01974ad0a4';

async function testAptcAndCoverage() {
  const zip = '33324';
  const countyFips = '12011';
  const state = 'FL';
  const year = 2026;
  const searchUrl = `https://marketplace.api.healthcare.gov/api/v1/plans/search?apikey=${apiKey}`;

  console.log('Testing aptc_eligible and aptc fields with covered vs non-covered members...\n');

  // Test 1: Mapped relationships: Self (27), Spouse (27), Child (16)
  const test1 = {
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
  let res = await fetch(searchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(test1) });
  let data = await res.json();
  console.log('Test 1 (All 3 with Child mapped, aptc_eligible: true):', res.status, 'Total:', data.total, 'Plans:', data.plans?.length);

  // Test 2: What if aptc_eligible: false for Member 3?
  const test2 = {
    household: {
      income: 50000,
      people: [
        { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', relationship: 'Self' },
        { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', relationship: 'Spouse' },
        { age: 16, gender: 'Male', uses_tobacco: false, aptc_eligible: false, utilization: 'Medium', relationship: 'Child' }
      ]
    },
    market: 'Individual',
    place: { countyfips: countyFips, state: state, zipcode: zip },
    year: year,
    limit: 10,
    offset: 0
  };
  res = await fetch(searchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(test2) });
  data = await res.json();
  console.log('Test 2 (Member 3 aptc_eligible: false):', res.status, 'Total:', data.total, 'Plans:', data.plans?.length);

  // Test 3: What if only covered applicants are included in /plans/search people array?
  const test3 = {
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
  res = await fetch(searchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(test3) });
  data = await res.json();
  console.log('Test 3 (Only covered members in people array):', res.status, 'Total:', data.total, 'Plans:', data.plans?.length);
}

testAptcAndCoverage().catch(console.error);
