const apiKey = 'd687412e7b53146b2631dc01974ad0a4';

async function inspectRawTarget5() {
  const planId = '21525FL0020016';
  const year = 2026;
  const url = `https://marketplace.api.healthcare.gov/api/v1/plans/${planId}?apikey=${apiKey}&year=${year}`;

  const res = await fetch(url);
  const data = await res.json();
  const rawPlan = data.plan;

  console.log('ALL 67 RAW BENEFITS IN 21525FL0020016:\n');
  rawPlan.benefits.forEach((b, idx) => {
    const nameLower = (b.name || '').toLowerCase();
    const typeLower = (b.type || '').toLowerCase();

    const isMatch = [
      'imaging', 'ct', 'pet', 'scan', 'radiology', 'x-ray', 'xray',
      'tele', 'virtual', 'remote', 'online', 'mail', 'order', 'delivery',
      'drug', 'pharmacy', 'prescription'
    ].some(kw => nameLower.includes(kw) || typeLower.includes(kw));

    if (isMatch) {
      console.log(`[${idx}] Type: "${b.type}" | Name: "${b.name}" | Covered: ${b.covered}`);
      console.log('    In-Network CS:', b.cost_sharings?.filter(cs => cs.network_tier === 'In-Network'));
      if (b.explanation) console.log('    Explanation:', b.explanation);
    }
  });
}

inspectRawTarget5().catch(console.error);
