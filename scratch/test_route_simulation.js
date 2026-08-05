const apiKey = 'd687412e7b53146b2631dc01974ad0a4';

async function testPlanSearch(targetPlanId) {
  const cleanPlanId = targetPlanId.trim().toUpperCase();
  const zip = '33324';
  const countyFips = '12011';
  const state = 'FL';
  const year = 2026;

  console.log(`\n========================================`);
  console.log(`SEARCHING FOR PLAN: ${cleanPlanId}`);
  console.log(`========================================`);

  const searchUrl = `https://marketplace.api.healthcare.gov/api/v1/plans/search?apikey=${apiKey}`;
  const searchPayload = {
    household: { income: 45000, people: [{ age: 35, gender: 'Male', uses_tobacco: false, aptc_eligible: true }] },
    market: 'Individual',
    place: { countyfips: countyFips, state: state, zipcode: zip },
    year: year,
    limit: 100,
    offset: 0
  };

  let matchedPlan = null;
  let relatedVariants = [];
  let totalPlansChecked = 0;
  let offset = 0;
  let apiTotal = 0;
  let pagesFetched = 0;

  const hiosBase = cleanPlanId.length >= 10 ? cleanPlanId.substring(0, 10) : cleanPlanId;

  while (offset < 500) {
    searchPayload.offset = offset;
    pagesFetched++;

    const res = await fetch(searchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchPayload)
    });

    if (!res.ok) {
      console.log(`API Error HTTP ${res.status}`);
      break;
    }

    const data = await res.json();
    const plans = data.plans || [];
    apiTotal = data.total || 0;
    totalPlansChecked += plans.length;

    console.log(`Page ${pagesFetched} (offset ${offset}): Returned ${plans.length} plans. Total in API: ${apiTotal}`);

    if (plans.length === 0) break;

    // Check exact match
    const exact = plans.find(p => (p.id || '').toUpperCase() === cleanPlanId);
    if (exact && !matchedPlan) {
      matchedPlan = exact;
    }

    // Check related variants (same HIOS base ID)
    const related = plans.filter(p => (p.id || '').toUpperCase().startsWith(hiosBase) && (p.id || '').toUpperCase() !== cleanPlanId);
    related.forEach(p => {
      if (!relatedVariants.some(r => r.id === p.id)) {
        relatedVariants.push({ id: p.id, name: p.name, issuer: p.issuer?.name });
      }
    });

    if (matchedPlan) {
      console.log(`EXACT MATCH FOUND on page ${pagesFetched}: [${matchedPlan.id}] ${matchedPlan.name}`);
      break;
    }

    if (offset + plans.length >= apiTotal) break;
    offset += plans.length;
  }

  console.log(`\nSUMMARY FOR ${cleanPlanId}:`);
  console.log(`- Total plans checked across ${pagesFetched} pages: ${totalPlansChecked} (out of ${apiTotal})`);
  console.log(`- Exact match found: ${!!matchedPlan}`);
  console.log(`- Related variants count: ${relatedVariants.length}`);
  if (relatedVariants.length > 0) {
    console.log(`- Related variants:`, relatedVariants);
  }
}

async function run() {
  await testPlanSearch('30252FL0070065');
  await testPlanSearch('21525FL0020016');
}

run().catch(console.error);
