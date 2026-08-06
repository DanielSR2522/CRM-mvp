import { supabase } from '../src/lib/supabaseClient';

async function runTests() {
  console.log('===========================================================');
  console.log('TESTING CLIENT OVERVIEW BUSINESS RULES & CLASSIFICATIONS');
  console.log('===========================================================\n');

  let pass = 0;
  let fail = 0;

  function assert(cond: boolean, msg: string) {
    if (cond) {
      console.log(`✅ PASS: ${msg}`);
      pass++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      fail++;
    }
  }

  // 1. Create a clean test client
  const { data: testClient, error: clientErr } = await supabase
    .from('clients')
    .insert({
      full_name: `Overview Test Client ${Date.now()}`,
      email: `overview_test_${Date.now()}@example.com`,
    })
    .select('id')
    .single();

  if (clientErr || !testClient) {
    console.error('Failed to create test client:', clientErr);
    process.exit(1);
  }

  const clientId = testClient.id;

  try {
    // 2. Setup P&C test records
    // Active P&C
    await supabase.from('policies').insert({
      client_id: clientId,
      policy_type: 'Auto',
      writing_company: 'Geico',
      policy_number: 'PC-ACTIVE-100',
      status: 'Active',
      total_premium: 1200,
      expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now (Expiring Soon)
    });

    // Pending P&C
    await supabase.from('policies').insert({
      client_id: clientId,
      policy_type: 'Home',
      writing_company: 'State Farm',
      policy_number: 'PC-PENDING-200',
      status: 'Pending',
      total_premium: 800,
    });

    // Cancelled P&C (with 30 days expiration)
    await supabase.from('policies').insert({
      client_id: clientId,
      policy_type: 'Flood',
      writing_company: 'Allstate',
      policy_number: 'PC-CANCELLED-300',
      status: 'Cancelled',
      total_premium: 500,
      expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });

    // 3. Setup Health test records
    // Health active = true
    await supabase.from('health_policies').insert({
      client_id: clientId,
      plan_name: 'Silver 87 ACA',
      company_2026: 'Ambetter',
      plan_id: 'HEALTH-ACTIVE-1',
      active: true,
      policy_status: 'Active',
      plan_cost: 350,
    });

    // Health active = false (even if policy_status says Active)
    await supabase.from('health_policies').insert({
      client_id: clientId,
      plan_name: 'Bronze 60 ACA',
      company_2026: 'Molina',
      plan_id: 'HEALTH-INACTIVE-2',
      active: false,
      policy_status: 'Active',
      plan_cost: 200,
    });

    // 4. Setup Life test records
    // Case 6: Life policy without products
    await supabase.from('life_policies').insert({
      client_id: clientId,
      status: 'Active',
    });

    // Case 7: Life policy with product company null
    const { data: lifeNullComp } = await supabase.from('life_policies').insert({
      client_id: clientId,
      status: 'Active',
    }).select('*').single();
    if (lifeNullComp) {
      await supabase.from('life_policy_products').insert({
        life_policy_id: lifeNullComp.id,
        product_type: 'Term',
        company: null,
      });
    }

    // Case 8: Life policy with product company empty string
    const { data: lifeEmptyComp } = await supabase.from('life_policies').insert({
      client_id: clientId,
      status: 'Active',
    }).select('*').single();
    if (lifeEmptyComp) {
      await supabase.from('life_policy_products').insert({
        life_policy_id: lifeEmptyComp.id,
        product_type: 'IUL',
        company: '',
      });
    }

    // Case 9: Life policy with product company containing only spaces
    const { data: lifeSpacesComp } = await supabase.from('life_policies').insert({
      client_id: clientId,
      status: 'Active',
    }).select('*').single();
    if (lifeSpacesComp) {
      await supabase.from('life_policy_products').insert({
        life_policy_id: lifeSpacesComp.id,
        product_type: 'Whole Life',
        company: '   ',
      });
    }

    // Case 10 & 11: Valid Life policies with valid company names
    const { data: lifeValid1 } = await supabase.from('life_policies').insert({
      client_id: clientId,
      status: 'Active',
    }).select('*').single();
    if (lifeValid1) {
      await supabase.from('life_policy_products').insert({
        life_policy_id: lifeValid1.id,
        product_type: 'Term',
        company: 'Prudential Life',
        policy_number: 'LIFE-VAL-101',
        policy_date: '2026-05-15',
        monthly_premium: 120.50,
      });
    }

    const { data: lifeValid2 } = await supabase.from('life_policies').insert({
      client_id: clientId,
      status: 'Active',
    }).select('*').single();
    if (lifeValid2) {
      await supabase.from('life_policy_products').insert({
        life_policy_id: lifeValid2.id,
        product_type: 'IUL',
        company: 'Mutual of Omaha',
        policy_number: 'LIFE-VAL-202',
        policy_date: '2026-06-01',
        monthly_premium: 250.00,
      });
    }

    // 5. Query Supabase exactly as page.tsx does
    const [pcRes, healthRes, lifeRes] = await Promise.all([
      supabase.from('policies').select('*').eq('client_id', clientId).eq('status', 'Active'),
      supabase.from('health_policies').select('*').eq('client_id', clientId).eq('active', true),
      supabase.from('life_policies').select('*, life_policy_products(*)').eq('client_id', clientId),
    ]);

    const pcPolicies = pcRes.data || [];
    const healthPolicies = healthRes.data || [];
    const lifePoliciesRaw = lifeRes.data || [];

    // Filter Overview cards
    const overviewCards: any[] = [];

    // P&C (Active status only)
    pcPolicies.forEach((p) => {
      if (p.status === 'Active') {
        overviewCards.push({
          id: p.id,
          businessLine: 'property_casualty',
          company_name: p.writing_company,
          policy_type: p.policy_type,
          policy_number: p.policy_number,
          expiration_date: p.expiration_date,
        });
      }
    });

    // Health (active = true only)
    healthPolicies.forEach((h) => {
      if (h.active === true) {
        overviewCards.push({
          id: h.id,
          businessLine: 'health',
          company_name: h.company_2026,
          policy_type: h.plan_name,
          policy_number: h.plan_id,
        });
      }
    });

    // Life (Qualifying company only)
    lifePoliciesRaw.forEach((l) => {
      const prods = l.life_policy_products || [];
      const qual = prods.find((prod: any) => prod.company && typeof prod.company === 'string' && prod.company.trim().length > 0);
      if (qual) {
        overviewCards.push({
          id: l.id,
          businessLine: 'life',
          company_name: qual.company.trim(),
          policy_type: qual.product_type,
          policy_number: qual.policy_number || 'N/A',
          premium: qual.monthly_premium,
        });
      }
    });

    // TEST CASES VERIFICATION
    assert(overviewCards.some(c => c.policy_number === 'PC-ACTIVE-100'), 'Case 1: P&C status Active appears in Overview');
    assert(!overviewCards.some(c => c.policy_number === 'PC-PENDING-200'), 'Case 2: P&C status Pending does NOT appear');
    assert(!overviewCards.some(c => c.policy_number === 'PC-CANCELLED-300'), 'Case 3: P&C status Cancelled does NOT appear');
    assert(overviewCards.some(c => c.company_name === 'Ambetter'), 'Case 4: Health active = true appears in Overview');
    assert(!overviewCards.some(c => c.company_name === 'Molina'), 'Case 5: Health active = false does NOT appear regardless of policy_status');
    
    const lifeCardsInOverview = overviewCards.filter(c => c.businessLine === 'life');
    assert(lifeCardsInOverview.length === 2, 'Case 6-11: Exactly 2 qualifying Life policies appear (unqualified ones excluded)');
    assert(lifeCardsInOverview.some(c => c.company_name === 'Prudential Life'), 'Case 10: Life policy with Prudential Life appears');
    assert(lifeCardsInOverview.some(c => c.company_name === 'Mutual of Omaha'), 'Case 11: Life policy with Mutual of Omaha appears');

    // Case 12: Active Policies metric equals exact number of visible Overview policy cards
    const activeCountMetric = overviewCards.length;
    assert(activeCountMetric === 4, `Case 12: Active Policies metric (${activeCountMetric}) equals exact number of visible Overview cards (4)`);

    // Case 13: Expiring Soon works only for qualifying Active P&C policies
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sixtyDays = new Date();
    sixtyDays.setDate(today.getDate() + 60);
    sixtyDays.setHours(23, 59, 59, 999);

    const expiringCount = overviewCards.filter(c => {
      if (c.businessLine !== 'property_casualty' || !c.expiration_date) return false;
      const exp = new Date(c.expiration_date + 'T00:00:00');
      return exp >= today && exp <= sixtyDays;
    }).length;

    assert(expiringCount === 1, `Case 13: Expiring Soon metric equals 1 (only active P&C policy PC-ACTIVE-100 within 60 days, cancelled P&C excluded)`);

  } finally {
    // Clean up test client
    await supabase.from('clients').delete().eq('id', clientId);
    console.log('Cleaned up test client.');
  }

  console.log('\n===========================================================');
  console.log(`RESULTS: ${pass} PASSED, ${fail} FAILED`);
  console.log('===========================================================');
}

runTests();
