import { NextResponse } from 'next/server';

const MARKETPLACE_API_BASE = 'https://marketplace.api.healthcare.gov/api/v1';
const DEFAULT_API_KEY = 'd687412e7b53146b2631dc01974ad0a4';

function getApiKey(): string {
  return process.env.MARKETPLACE_API_KEY || DEFAULT_API_KEY;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { zipCode, countyFips, state, coverageYear, householdIncome, people } = body;

    const cleanZip = (zipCode || '').trim();
    if (!/^\d{5}$/.test(cleanZip)) {
      return NextResponse.json({ error: 'Invalid ZIP', message: 'Valid 5-digit ZIP code required.' }, { status: 400 });
    }

    const year = parseInt(coverageYear || '2026', 10);
    const income = typeof householdIncome === 'number' && householdIncome > 0 ? householdIncome : 45000;
    const searchPeople = Array.isArray(people) && people.length > 0 ? people : [{ age: 35, gender: 'Male', uses_tobacco: false, aptc_eligible: true }];

    let resolvedFips = (countyFips || '').trim();
    let resolvedState = (state || '').trim().toUpperCase();

    if (!resolvedFips || !resolvedState) {
      const countyUrl = `${MARKETPLACE_API_BASE}/counties/by/zip/${cleanZip}?apikey=${encodeURIComponent(getApiKey())}`;
      const countyRes = await fetch(countyUrl);
      if (countyRes.ok) {
        const countyData = await countyRes.json();
        if (countyData.counties && countyData.counties.length > 0) {
          resolvedFips = countyData.counties[0].fips;
          resolvedState = countyData.counties[0].state;
        }
      }
    }

    const eligUrl = `${MARKETPLACE_API_BASE}/households/eligibility/estimates?apikey=${encodeURIComponent(getApiKey())}`;
    const eligRes = await fetch(eligUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        household: { income, people: searchPeople },
        place: { countyfips: resolvedFips, state: resolvedState, zipcode: cleanZip },
        year
      })
    });

    if (!eligRes.ok) {
      return NextResponse.json({ estimates: null, message: 'Eligibility calculation unavailable.' }, { status: 200 });
    }

    const data = await eligRes.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal Server Error', message: error?.message || 'Eligibility check failed.' }, { status: 500 });
  }
}
