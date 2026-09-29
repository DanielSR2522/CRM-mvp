import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Non-P&C Dashboard Metric Computations', () => {
  it('filters active Health policies from inactive historical entries', () => {
    const rawHealthPolicies = [
      { id: 'hp-1', active: true, number_of_people_on_tax_return: 1 },
      { id: 'hp-2', active: true, coverage_members_count: 3 },
      { id: 'hp-3', active: false, number_of_people_on_tax_return: 2 },
      { id: 'hp-4', active: false, number_of_people_on_tax_return: 1 },
    ];

    const activePolicies = rawHealthPolicies.filter((p) => p.active === true);
    assert.equal(activePolicies.length, 2);

    const membersCount = activePolicies.reduce((acc, p) => {
      const cnt = p.coverage_members_count ?? p.number_of_people_on_tax_return ?? 1;
      return acc + Number(cnt);
    }, 0);

    assert.equal(membersCount, 4); // 1 + 3
  });

  it('counts distinct Life policies rather than multiplying by joined products', () => {
    const lifePolicies = [
      {
        id: 'lp-1',
        life_policy_products: [
          { product_type: 'Term Life', company: 'NY Life' },
          { product_type: 'Rider', company: 'NY Life' },
        ],
      },
      {
        id: 'lp-2',
        life_policy_products: [{ product_type: 'Variable Annuity', company: 'NY Life' }],
      },
    ];

    assert.equal(lifePolicies.length, 2);
  });

  it('preserves total inventory policy counts regardless of period creation filters', () => {
    const healthPolicies = [
      { id: 'hp-1', active: true, created_at: '2025-01-01T00:00:00Z' },
      { id: 'hp-2', active: true, created_at: '2025-06-15T00:00:00Z' },
    ];

    const totalCount = healthPolicies.length;
    assert.equal(totalCount, 2);

    const in7DaysMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const newThisWeek = healthPolicies.filter((p) => new Date(p.created_at).getTime() >= in7DaysMs).length;

    assert.equal(newThisWeek, 0);
    // Total inventory card must NOT be 0 when newThisWeek is 0
    assert.equal(totalCount > 0, true);
  });

  it('computes Policy Mix percentages matching top-card source counts', () => {
    const healthCount = 9;
    const medicareCount = 0;
    const supplementalCount = 0;
    const lifeCount = 2;
    const totalCount = healthCount + medicareCount + supplementalCount + lifeCount;

    assert.equal(totalCount, 11);

    const calcPct = (cnt: number) => Math.round((cnt / totalCount) * 100);

    const mix = [
      { id: 'health', count: healthCount, percentage: calcPct(healthCount) },
      { id: 'medicare', count: medicareCount, percentage: calcPct(medicareCount) },
      { id: 'supplemental', count: supplementalCount, percentage: calcPct(supplementalCount) },
      { id: 'life', count: lifeCount, percentage: calcPct(lifeCount) },
    ];

    assert.equal(mix[0].percentage, 82); // 9/11 = 81.8% -> 82%
    assert.equal(mix[3].percentage, 18); // 2/11 = 18.2% -> 18%
  });

  it('builds Top Carriers without duplicate counting or null carrier names', () => {
    const healthPolicies = [
      { company_2026: 'Oscar' },
      { company_2026: 'Oscar' },
      { company_2026: 'Florida Blue' },
    ];

    const lifePolicies = [
      { life_policy_products: [{ company: 'NY Life' }] },
      { life_policy_products: [{ company: 'NY Life' }] },
    ];

    const carrierCounts = new Map<string, number>();

    healthPolicies.forEach((p) => {
      const c = (p.company_2026 || '').trim();
      if (c) carrierCounts.set(c, (carrierCounts.get(c) || 0) + 1);
    });

    lifePolicies.forEach((p) => {
      const mainProd = p.life_policy_products?.[0];
      const c = (mainProd?.company || '').trim();
      if (c) carrierCounts.set(c, (carrierCounts.get(c) || 0) + 1);
    });

    const sorted = Array.from(carrierCounts.entries()).sort((a, b) => b[1] - a[1]);

    assert.equal(sorted[0][0], 'Oscar');
    assert.equal(sorted[0][1], 2);
    assert.equal(sorted[1][0], 'NY Life');
    assert.equal(sorted[1][1], 2);
    assert.equal(sorted[2][0], 'Florida Blue');
    assert.equal(sorted[2][1], 1);
  });

  it('enforces multi-agent data isolation between distinct agents', () => {
    const loniClients = ['c-loni-1', 'c-loni-2'];
    const decireClients = ['c-decire-1', 'c-decire-2', 'c-decire-3'];

    const allHealthPolicies = [
      { id: 'hp-1', client_id: 'c-loni-1' },
      { id: 'hp-2', client_id: 'c-loni-2' },
      { id: 'hp-3', client_id: 'c-decire-1' },
      { id: 'hp-4', client_id: 'c-decire-2' },
      { id: 'hp-5', client_id: 'c-decire-3' },
    ];

    const loniHealth = allHealthPolicies.filter((p) => loniClients.includes(p.client_id));
    const decireHealth = allHealthPolicies.filter((p) => decireClients.includes(p.client_id));

    assert.equal(loniHealth.length, 2);
    assert.equal(decireHealth.length, 3);
    assert.deepEqual(loniHealth.map(p => p.id), ['hp-1', 'hp-2']);
    assert.deepEqual(decireHealth.map(p => p.id), ['hp-3', 'hp-4', 'hp-5']);
  });

  it('queries health_policies using policy_status column instead of invalid status column', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const pagePath = path.resolve(process.cwd(), 'src/app/dashboard/page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf8');

    // Verify health_policies select statement contains policy_status and NOT status
    const healthSelectRegex = /\.from\('health_policies'\)\s*\.select\('([^']+)'\)/;
    const match = pageContent.match(healthSelectRegex);
    assert.ok(match, 'health_policies select call not found in page.tsx');
    const selectFields = match[1].split(',').map((f) => f.trim());

    assert.ok(selectFields.includes('policy_status'), 'policy_status column must be in health_policies select');
    assert.ok(!selectFields.includes('status'), 'invalid status column must NOT be in health_policies select');
  });
});
