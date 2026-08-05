const apiKey = 'd687412e7b53146b2631dc01974ad0a4';
const zip = '33324';

async function test() {
  const countyUrl = `https://marketplace.api.healthcare.gov/api/v1/counties/by/zip/${zip}?apikey=${apiKey}`;
  const cRes = await fetch(countyUrl);
  const cData = await cRes.json();
  console.log('COUNTIES RESULT:', JSON.stringify(cData, null, 2));

  if (cData.counties && cData.counties.length > 0) {
    const county = cData.counties[0];
    console.log(`Using County: ${county.name} (${county.fips}), State: ${county.state}`);

    const searchUrl = `https://marketplace.api.healthcare.gov/api/v1/plans/search?apikey=${apiKey}`;
    const payload = {
      household: { income: 45000, people: [{ age: 35, gender: 'Male', uses_tobacco: false, aptc_eligible: true }] },
      market: 'Individual',
      place: { countyfips: county.fips, state: county.state, zipcode: zip },
      year: 2026,
      limit: 100,
      offset: 0
    };
    const sRes = await fetch(searchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const sData = await sRes.json();
    console.log('SEARCH STATUS:', sRes.status);
    console.log('TOTAL PLANS IN AREA:', sData.total);
    console.log('RETURNED PLANS COUNT:', sData.plans ? sData.plans.length : 0);

    if (sData.plans) {
      const target = '30252FL0070065';
      const exact = sData.plans.find(p => p.id === target);
      const hiosBase = target.substring(0, 10); // 30252FL007
      const related = sData.plans.filter(p => p.id.startsWith(hiosBase));

      console.log('EXACT MATCH FOUND (30252FL0070065):', !!exact);
      if (exact) console.log('EXACT MATCH:', { id: exact.id, name: exact.name });
      console.log('RELATED HIOS BASE MATCHES (30252FL007*):', related.map(p => ({ id: p.id, name: p.name })));

      console.log('\nFIRST 10 PLANS RETURNED:');
      sData.plans.slice(0, 10).forEach((p, idx) => {
        console.log(`  ${idx + 1}. [${p.id}] ${p.name} (${p.issuer?.name})`);
      });

      // Check test B: 21525FL0020016
      const planB = '21525FL0020016';
      const exactB = sData.plans.find(p => p.id === planB);
      console.log('\nPLAN B MATCH (21525FL0020016):', !!exactB);
      if (exactB) console.log('PLAN B DETAILS:', { id: exactB.id, name: exactB.name });
    }
  }
}

test().catch(err => console.error('ERROR:', err));
