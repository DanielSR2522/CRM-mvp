import { NextResponse } from 'next/server';
import { normalizeMarketplacePlan } from '@/lib/marketplace/normalizer';

const MARKETPLACE_API_BASE = 'https://marketplace.api.healthcare.gov/api/v1';
const DEFAULT_API_KEY = 'd687412e7b53146b2631dc01974ad0a4';

function getApiKey(): string {
  return process.env.MARKETPLACE_API_KEY || DEFAULT_API_KEY;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      planId,
      coverageYear,
      zipCode,
      countyFips,
      state,
      householdIncome,
      people
    } = body;

    // Validate inputs
    const cleanPlanId = (planId || '').trim().toUpperCase();
    if (!cleanPlanId) {
      return NextResponse.json(
        { error: 'Invalid Plan ID', message: 'Please enter a valid Plan ID (e.g. 21525FL0020016).' },
        { status: 400 }
      );
    }

    const cleanZip = (zipCode || '').trim();
    if (!/^\d{5}$/.test(cleanZip)) {
      return NextResponse.json(
        { error: 'Missing or Invalid ZIP', message: 'Please enter a valid 5-digit ZIP code.' },
        { status: 400 }
      );
    }

    const year = parseInt(coverageYear || '2026', 10);
    if (isNaN(year) || year < 2020 || year > 2030) {
      return NextResponse.json(
        { error: 'Missing Coverage Year', message: 'Please specify a valid coverage year (e.g. 2026).' },
        { status: 400 }
      );
    }

    let resolvedFips = (countyFips || '').trim();
    let resolvedState = (state || '').trim().toUpperCase();

    // If FIPS or state is missing, resolve county by ZIP code
    if (!resolvedFips || !resolvedState) {
      const countyUrl = `${MARKETPLACE_API_BASE}/counties/by/zip/${cleanZip}?apikey=${encodeURIComponent(getApiKey())}`;
      const countyRes = await fetch(countyUrl, { headers: { Accept: 'application/json' } });
      if (countyRes.ok) {
        const countyData = await countyRes.json();
        if (countyData.counties && countyData.counties.length > 0) {
          resolvedFips = countyData.counties[0].fips;
          resolvedState = countyData.counties[0].state;
        }
      }
    }

    if (!resolvedFips || !resolvedState) {
      return NextResponse.json(
        { error: 'Missing County/State', message: 'Could not resolve service area county FIPS for the provided ZIP code.' },
        { status: 400 }
      );
    }

    // Build people array for search
    const searchPeople = Array.isArray(people) && people.length > 0
      ? people.map((p: any) => ({
          age: Number(p.age || 35),
          gender: p.gender || 'Male',
          uses_tobacco: !!p.uses_tobacco,
          aptc_eligible: true,
          utilization: 'Medium',
          utilization_level: 'Medium',
          relationship: p.relationship || 'Self'
        }))
      : [{ age: 35, gender: 'Male', uses_tobacco: false, aptc_eligible: true, utilization: 'Medium', utilization_level: 'Medium', relationship: 'Self' }];

    const income = typeof householdIncome === 'number' && householdIncome > 0 ? householdIncome : 45000;

    const searchPayload = {
      household: {
        income: income,
        people: searchPeople
      },
      market: 'Individual',
      place: {
        countyfips: resolvedFips,
        state: resolvedState,
        zipcode: cleanZip
      },
      year: year,
      limit: 100,
      offset: 0
    };

    // Request plans from Healthcare.gov Marketplace API with pagination
    let matchedPlan: any = null;
    let totalPlansChecked = 0;
    let offset = 0;

    const searchUrl = `${MARKETPLACE_API_BASE}/plans/search?apikey=${encodeURIComponent(getApiKey())}`;

    while (!matchedPlan && offset < 500) {
      searchPayload.offset = offset;
      const searchRes = await fetch(searchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(searchPayload)
      });

      if (!searchRes.ok) {
        let errMsg = `Marketplace API HTTP ${searchRes.status}`;
        try {
          const errJson = await searchRes.json();
          if (errJson.message || errJson.error) errMsg = [errJson.message, errJson.error].filter(Boolean).join(' — ');
        } catch {}
        return NextResponse.json({ error: 'Marketplace API Error', message: errMsg }, { status: searchRes.status });
      }

      const searchData = await searchRes.json();
      const plans = searchData.plans || [];
      totalPlansChecked += plans.length;

      if (plans.length === 0) break;

      // Match exact Plan ID
      matchedPlan = plans.find((p: any) => {
        const pid = (p.id || '').toUpperCase();
        return pid === cleanPlanId || pid.startsWith(cleanPlanId);
      });

      if (matchedPlan) break;

      if (offset + plans.length >= (searchData.total || 0)) break;
      offset += plans.length;
    }

    if (!matchedPlan) {
      return NextResponse.json(
        {
          found: false,
          error: 'Plan Not Found',
          message: 'Plan not found for this year and service area.'
        },
        { status: 444 }
      );
    }

    // Call eligibility estimates endpoint if household income is supplied
    let taxCreditEstimate: number | null = null;
    try {
      const eligUrl = `${MARKETPLACE_API_BASE}/households/eligibility/estimates?apikey=${encodeURIComponent(getApiKey())}`;
      const eligRes = await fetch(eligUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          household: { income: income, people: searchPeople },
          place: { countyfips: resolvedFips, state: resolvedState, zipcode: cleanZip },
          year: year
        })
      });
      if (eligRes.ok) {
        const eligData = await eligRes.json();
        if (eligData.estimates && eligData.estimates.length > 0 && typeof eligData.estimates[0].aptc === 'number') {
          taxCreditEstimate = eligData.estimates[0].aptc;
        }
      }
    } catch {}

    const normalizedPlan = normalizeMarketplacePlan(matchedPlan, taxCreditEstimate);

    return NextResponse.json({
      found: true,
      plan: normalizedPlan,
      searchArea: {
        zipCode: cleanZip,
        countyFips: resolvedFips,
        state: resolvedState,
        coverageYear: year
      }
    });

  } catch (error: any) {
    console.error('Marketplace Plan Lookup Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error?.message || 'An error occurred while connecting to Healthcare.gov.' },
      { status: 500 }
    );
  }
}
