import { NextResponse } from 'next/server';
import { normalizeMarketplacePlan } from '@/lib/marketplace/normalizer';

const MARKETPLACE_API_BASE = 'https://marketplace.api.healthcare.gov/api/v1';
const DEFAULT_API_KEY = 'd687412e7b53146b2631dc01974ad0a4';

function getApiKey(): string {
  return process.env.MARKETPLACE_API_KEY || DEFAULT_API_KEY;
}

/**
 * Maps CRM relationship strings to Healthcare.gov API accepted values:
 * - 'Self' -> 'Self'
 * - 'Spouse' -> 'Spouse'
 * - 'Son', 'Daughter', 'Child', 'Stepchild' -> 'Child'
 * - 'Parent', 'Sibling', 'Domestic Partner', 'Other Dependent', 'Other' -> 'Other'
 */
function mapRelationshipToApi(rel?: string): string {
  if (!rel) return 'Self';
  const r = rel.trim();
  if (r === 'Self') return 'Self';
  if (r === 'Spouse') return 'Spouse';
  if (['Son', 'Daughter', 'Child', 'Stepchild'].includes(r)) return 'Child';
  return 'Other';
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

    // 1. Validate inputs & Normalize Plan ID
    const cleanPlanId = (planId || '').trim().toUpperCase();
    if (!cleanPlanId) {
      return NextResponse.json(
        { error: 'Invalid Plan ID', message: 'Please enter a valid Plan ID (e.g. 30252FL0070065).' },
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

    // 2. County Resolution
    let countyName = 'Unknown County';
    let resolvedFips = (countyFips || '').trim();
    let resolvedState = (state || '').trim().toUpperCase();

    const countyUrl = `${MARKETPLACE_API_BASE}/counties/by/zip/${cleanZip}?apikey=${encodeURIComponent(getApiKey())}`;
    const countyRes = await fetch(countyUrl, { headers: { Accept: 'application/json' } });

    if (countyRes.ok) {
      const countyData = await countyRes.json();
      const counties: any[] = countyData.counties || [];

      if (counties.length > 0) {
        let matchedCounty = null;
        if (resolvedFips) {
          matchedCounty = counties.find(c => c.fips === resolvedFips);
        }
        if (!matchedCounty) {
          matchedCounty = counties[0];
        }

        countyName = matchedCounty.name || 'County';
        resolvedFips = matchedCounty.fips;
        resolvedState = matchedCounty.state;
      } else {
        return NextResponse.json(
          { error: 'County Resolution Failed', message: 'County could not be resolved for this ZIP.' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'County API Error', message: 'County could not be resolved for this ZIP.' },
        { status: 400 }
      );
    }

    // 3. Separate Tax Household Members vs Covered / Enrolling Members
    const allHouseholdPeople: any[] = Array.isArray(people) && people.length > 0 ? people : [];
    const coveredPeople = allHouseholdPeople.filter(p => p.applying_for_coverage !== false);

    // Fallback if no members have coverage flag set to true
    const activeCoveredList = coveredPeople.length > 0 ? coveredPeople : (allHouseholdPeople.length > 0 ? [allHouseholdPeople[0]] : []);

    // Build searchPeople array for premium calculation (ONLY COVERED MEMBERS)
    const searchPeople = activeCoveredList.map((p: any) => ({
      age: Number(p.age || 35),
      gender: p.gender || 'Male',
      uses_tobacco: !!p.uses_tobacco,
      aptc_eligible: true,
      utilization: 'Medium',
      utilization_level: 'Medium',
      relationship: mapRelationshipToApi(p.relationship)
    }));

    // Build eligPeople array for APTC estimation (ALL TAX HOUSEHOLD MEMBERS)
    const eligPeople = (allHouseholdPeople.length > 0 ? allHouseholdPeople : searchPeople).map((p: any) => ({
      age: Number(p.age || 35),
      gender: p.gender || 'Male',
      uses_tobacco: !!p.uses_tobacco,
      aptc_eligible: true,
      utilization: 'Medium',
      utilization_level: 'Medium',
      relationship: mapRelationshipToApi(p.relationship)
    }));

    const income = typeof householdIncome === 'number' && householdIncome > 0 ? householdIncome : 45000;

    const pageSize = 10;
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
      limit: pageSize,
      offset: 0
    };

    // 4. Request plans from Healthcare.gov Marketplace API with robust pagination
    let matchedPlan: any = null;
    let matchedPage = 0;
    let matchedOffset = 0;
    const allFetchedPlans: any[] = [];
    const seenPlanIds = new Set<string>();
    let totalPlansInArea = 0;
    let offset = 0;
    let pagesRequested = 0;
    const offsetsRequested: number[] = [];
    let firstPageCount = 0;
    let topLevelKeys: string[] = [];
    let failedOffset: number | null = null;
    let firstPageHttpStatus = 200;

    const searchUrl = `${MARKETPLACE_API_BASE}/plans/search?apikey=${encodeURIComponent(getApiKey())}`;

    while (offset < 500) {
      searchPayload.offset = offset;
      pagesRequested++;
      offsetsRequested.push(offset);

      const searchRes = await fetch(searchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(searchPayload)
      });

      if (pagesRequested === 1) {
        firstPageHttpStatus = searchRes.status;
      }

      if (!searchRes.ok) {
        failedOffset = offset;
        let errMsg = `Marketplace API HTTP ${searchRes.status}`;
        try {
          const errJson = await searchRes.json();
          if (errJson.message || errJson.error) errMsg = [errJson.message, errJson.error].filter(Boolean).join(' — ');
        } catch {}

        if (pagesRequested === 1) {
          return NextResponse.json(
            { error: 'Marketplace API Error', message: `Marketplace request failed: ${errMsg}` },
            { status: searchRes.status }
          );
        }
        break;
      }

      const searchData = await searchRes.json();
      if (pagesRequested === 1) {
        topLevelKeys = Object.keys(searchData);
      }

      const plans: any[] = searchData.plans || [];
      totalPlansInArea = typeof searchData.total === 'number' ? searchData.total : totalPlansInArea;

      if (pagesRequested === 1) {
        firstPageCount = plans.length;
      }

      if (plans.length === 0) break;

      for (const p of plans) {
        const pid = (p.id || '').toUpperCase();
        if (pid && !seenPlanIds.has(pid)) {
          seenPlanIds.add(pid);
          allFetchedPlans.push(p);
        }
      }

      if (!matchedPlan) {
        const exact = plans.find((p: any) => (p.id || '').toUpperCase() === cleanPlanId);
        if (exact) {
          matchedPlan = exact;
          matchedPage = pagesRequested;
          matchedOffset = offset;
        }
      }

      if (matchedPlan) break;

      if (offset + plans.length >= totalPlansInArea) break;
      offset += plans.length;
    }

    // 5. HIOS Base Match & Related Variants Discovery
    const hiosBase = cleanPlanId.length >= 10 ? cleanPlanId.substring(0, 10) : cleanPlanId;
    const relatedVariants = allFetchedPlans.filter((p: any) => {
      const pid = (p.id || '').toUpperCase();
      return pid.startsWith(hiosBase) && pid !== cleanPlanId;
    });

    // 6. Handle Search Results & Distinct Messages
    if (!matchedPlan) {
      if (relatedVariants.length > 0) {
        return NextResponse.json({
          found: false,
          hasRelatedVariants: true,
          message: 'Exact plan variant not found. Related Marketplace variants are available.',
          relatedVariants: relatedVariants.map((v: any) => ({
            id: v.id,
            name: v.name || 'Marketplace Plan Variant',
            issuerName: v.issuer ? v.issuer.name : 'Marketplace Carrier',
            metalLevel: v.metal_level || ''
          })),
          searchArea: {
            zipCode: cleanZip,
            countyName,
            countyFips: resolvedFips,
            state: resolvedState,
            coverageYear: year
          }
        });
      }

      if (totalPlansInArea > 0) {
        return NextResponse.json({
          found: false,
          hasPlansInArea: true,
          message: `Marketplace plans are available for this area, but Plan ID ${cleanPlanId} was not found.`,
          searchArea: {
            zipCode: cleanZip,
            countyName,
            countyFips: resolvedFips,
            state: resolvedState,
            coverageYear: year
          }
        });
      }

      return NextResponse.json({
        found: false,
        hasPlansInArea: false,
        message: `No Marketplace plans were returned for ZIP ${cleanZip}, ${countyName}, for coverage year ${year}.`,
        searchArea: {
          zipCode: cleanZip,
          countyName,
          countyFips: resolvedFips,
          state: resolvedState,
          coverageYear: year
        }
      });
    }

    // 7. Calculate APTC Eligibility Estimate for full tax household
    let taxCreditEstimate: number | null = null;
    try {
      const eligUrl = `${MARKETPLACE_API_BASE}/households/eligibility/estimates?apikey=${encodeURIComponent(getApiKey())}`;
      const eligRes = await fetch(eligUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          household: { income: income, people: eligPeople },
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

    // 8. Fetch Full Plan Details from GET /plans/{planId} (Benefits, Deductibles, MOOPs, Documents)
    let fullDetailPlan = matchedPlan;
    let detailEndpointUsed = false;
    try {
      const detailUrl = `${MARKETPLACE_API_BASE}/plans/${matchedPlan.id}?apikey=${encodeURIComponent(getApiKey())}&year=${year}`;
      const detailRes = await fetch(detailUrl, { headers: { Accept: 'application/json' } });
      if (detailRes.ok) {
        const detailData = await detailRes.json();
        if (detailData.plan) {
          fullDetailPlan = {
            ...detailData.plan,
            // Preserve the premium calculated by /plans/search for the active covered members group!
            premium: matchedPlan.premium
          };
          detailEndpointUsed = true;
        }
      }
    } catch (err) {
      console.warn('Could not fetch full plan detail from GET /plans/{planId}:', err);
    }

    // 9. Normalize Plan Details & Benefits
    const normalizedPlan = normalizeMarketplacePlan(fullDetailPlan, taxCreditEstimate);

    // Development Audits
    if (process.env.NODE_ENV !== 'production') {
      console.log('[MARKETPLACE_PREMIUM_AUDIT]', {
        taxHouseholdSize: eligPeople.length,
        coveredMemberCount: activeCoveredList.length,
        taxHouseholdMemberNumbers: allHouseholdPeople.map((p: any) => p.member_number),
        coveredMemberNumbers: activeCoveredList.map((p: any) => p.member_number),
        outboundPeopleCount: searchPeople.length,
        outboundRelationships: searchPeople.map((p: any) => p.relationship),
        outboundEnrollmentFlags: activeCoveredList.map((p: any) => p.applying_for_coverage !== false),
        planId: normalizedPlan.id,
        fullPremium: normalizedPlan.premiumFull,
        aptc: normalizedPlan.taxCredit,
        finalPremium: normalizedPlan.premiumNet
      });

      const primaryCare = normalizedPlan.benefits.find(b => b.serviceName === 'Primary Care Visit');
      const specialist = normalizedPlan.benefits.find(b => b.serviceName === 'Specialist Visit');
      const urgentCare = normalizedPlan.benefits.find(b => b.serviceName === 'Urgent Care');
      const genericDrug = normalizedPlan.benefits.find(b => b.serviceName === 'Generic Drugs');

      console.log('[MARKETPLACE_DETAIL_AUDIT]', {
        planId: normalizedPlan.id,
        searchBenefitCount: matchedPlan.benefits ? matchedPlan.benefits.length : 0,
        detailBenefitCount: fullDetailPlan.benefits ? fullDetailPlan.benefits.length : 0,
        deductibleCount: fullDetailPlan.deductibles ? fullDetailPlan.deductibles.length : 0,
        moopCount: fullDetailPlan.moops ? fullDetailPlan.moops.length : 0,
        rawPrimaryCare: primaryCare?.individualValue,
        rawSpecialist: specialist?.individualValue,
        rawUrgentCare: urgentCare?.individualValue,
        rawGenericDrug: genericDrug?.individualValue,
        detailEndpointUsed
      });
    }

    return NextResponse.json({
      found: true,
      plan: normalizedPlan,
      searchArea: {
        zipCode: cleanZip,
        countyName,
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
