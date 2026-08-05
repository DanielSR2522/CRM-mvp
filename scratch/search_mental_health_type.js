const apiKey = 'd687412e7b53146b2631dc01974ad0a4';

async function findMentalHealthType() {
  const planId = '21525FL0020016';
  const year = 2026;
  const url = `https://marketplace.api.healthcare.gov/api/v1/plans/${planId}?apikey=${apiKey}&year=${year}`;

  const res = await fetch(url);
  const data = await res.json();

  console.log('ALL 67 BENEFIT TYPES & NAMES:');
  data.plan.benefits.forEach((b, i) => {
    if (b.name.toLowerCase().includes('mental') || b.type.toLowerCase().includes('mental') || b.name.toLowerCase().includes('outpatient')) {
      console.log(`[${i+1}] Type: ${b.type} | Name: ${b.name}`);
      console.log('    In-Network Cost Sharings:', b.cost_sharings?.filter(cs => cs.network_tier === 'In-Network'));
    }
  });
}

findMentalHealthType().catch(console.error);
