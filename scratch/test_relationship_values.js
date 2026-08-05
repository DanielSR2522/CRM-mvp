const apiKey = 'd687412e7b53146b2631dc01974ad0a4';

async function testRelationships() {
  const zip = '33324';
  const countyFips = '12011';
  const state = 'FL';
  const year = 2026;
  const searchUrl = `https://marketplace.api.healthcare.gov/api/v1/plans/search?apikey=${apiKey}`;

  const relationshipsToTest = [
    'Self',
    'Spouse',
    'Child',
    'Son',
    'Daughter',
    'Stepchild',
    'Parent',
    'Sibling',
    'Domestic Partner',
    'Other Dependent',
    'Other'
  ];

  console.log('Testing relationships in Healthcare.gov /plans/search API...\n');

  for (const rel of relationshipsToTest) {
    const payload = {
      household: {
        income: 50000,
        people: [
          { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', relationship: 'Self' },
          { age: 27, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', relationship: 'Spouse' },
          { age: 16, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', relationship: rel }
        ]
      },
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

    const data = await res.json();
    console.log(`Relationship: "${rel.padEnd(16)}" => HTTP ${res.status}, Total Plans: ${data.total ?? 'N/A'}, Plans Array: ${data.plans?.length ?? 0}`);
  }
}

testRelationships().catch(console.error);
