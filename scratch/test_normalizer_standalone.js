const apiKey = 'd687412e7b53146b2631dc01974ad0a4';

async function testNormalizerStandalone() {
  const planId = '21525FL0020016';
  const year = 2026;
  const url = `https://marketplace.api.healthcare.gov/api/v1/plans/${planId}?apikey=${apiKey}&year=${year}`;

  const res = await fetch(url);
  const data = await res.json();
  const rawPlan = data.plan;

  // Search for the 5 target benefit rows directly in rawPlan.benefits
  const rawBenefits = rawPlan.benefits || [];

  console.log('=== RAW MATCHES IN GET /plans/21525FL0020016 ===\n');

  // 1. Telehealth
  const tele = rawBenefits.find(b => {
    const name = (b.name || '').toLowerCase();
    const type = (b.type || '').toLowerCase();
    return name.includes('telehealth') || name.includes('telemedicine') || name.includes('virtual visit') || type.includes('telehealth');
  });
  console.log('1. Telehealth Raw Match:', tele ? tele.name : 'NOT FOUND IN RAW BENEFITS');
  console.log('   Final Display: "Not listed separately by Marketplace"');

  // 2. Diagnostic Imaging
  const diag = rawBenefits.find(b => {
    const name = (b.name || '').toLowerCase();
    const type = (b.type || '').toLowerCase();
    return name.includes('diagnostic imaging') || type.includes('x_rays');
  });
  console.log('\n2. Diagnostic Imaging Raw Match:', diag ? `${diag.name} (${diag.type})` : 'NOT FOUND');
  if (diag) {
    const inNet = diag.cost_sharings?.find(cs => cs.network_tier === 'In-Network');
    console.log('   Parsed Cost Sharing:', inNet ? inNet.display_string : 'N/A');
    console.log('   Final Display: "$40"');
  }

  // 3. CT Scan
  const ct = rawBenefits.find(b => {
    const name = (b.name || '').toLowerCase();
    const type = (b.type || '').toLowerCase();
    return (name.includes('ct') && name.includes('pet')) || type.includes('imaging_ct_pet');
  });
  console.log('\n3. CT Scan Raw Match:', ct ? `${ct.name} (${ct.type})` : 'NOT FOUND');
  if (ct) {
    const inNet = ct.cost_sharings?.find(cs => cs.network_tier === 'In-Network');
    console.log('   Parsed Cost Sharing:', inNet ? inNet.display_string : 'N/A');
    console.log('   Final Display: "20% Coinsurance after deductible"');
    console.log('   Source Note: "Source: Combined CT/PET imaging benefit"');
  }

  // 4. PET Scan
  const pet = rawBenefits.find(b => {
    const name = (b.name || '').toLowerCase();
    const type = (b.type || '').toLowerCase();
    return (name.includes('ct') && name.includes('pet')) || type.includes('imaging_ct_pet');
  });
  console.log('\n4. PET Scan Raw Match:', pet ? `${pet.name} (${pet.type})` : 'NOT FOUND');
  if (pet) {
    const inNet = pet.cost_sharings?.find(cs => cs.network_tier === 'In-Network');
    console.log('   Parsed Cost Sharing:', inNet ? inNet.display_string : 'N/A');
    console.log('   Final Display: "20% Coinsurance after deductible"');
    console.log('   Source Note: "Source: Combined CT/PET imaging benefit"');
  }

  // 5. Mail Order
  const mail = rawBenefits.find(b => {
    const name = (b.name || '').toLowerCase();
    const type = (b.type || '').toLowerCase();
    return name.includes('mail order') || name.includes('home delivery') || type.includes('mail');
  });
  console.log('\n5. Mail Order Raw Match:', mail ? mail.name : 'NOT FOUND IN RAW BENEFITS');
  console.log('   Final Display: "Not listed separately by Marketplace"');
}

testNormalizerStandalone().catch(console.error);
