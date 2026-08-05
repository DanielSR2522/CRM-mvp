import { HealthTaxHouseholdMember, HealthPrimaryApplicant } from '@/lib/health/types';
import { calculateAgeFromDateOnly } from '@/utils/dateUtils';

export interface MarketplacePersonRecord {
  member_number: number;
  age: number;
  relationship: string;
  applying_for_coverage: boolean;
  gender?: string;
  uses_tobacco?: boolean;
  annual_income?: number;
}

export interface TransformationResult {
  people: MarketplacePersonRecord[];
  householdSize: number;
  coveredApplicants: number;
  validationErrors: string[];
}

export function transformHouseholdToMarketplacePeople(
  applicant: HealthPrimaryApplicant | null,
  applicantCoverage: boolean,
  taxMembers: { [memberNumber: number]: HealthTaxHouseholdMember },
  taxMemberCount: number = 1,
  coverageYear?: number | string | null,
  zipCode?: string | null,
  state?: string | null,
  householdIncome?: number | null
): TransformationResult {
  const people: MarketplacePersonRecord[] = [];
  const validationErrors: string[] = [];

  // 1. Context validation
  if (!coverageYear) {
    validationErrors.push('Missing Coverage Year');
  }
  if (!zipCode || !/^\d{5}$/.test(zipCode.trim())) {
    validationErrors.push('Missing client ZIP Code');
  }
  if (!state || !state.trim()) {
    validationErrors.push('Missing client State');
  }

  // 2. Member 1 (Primary Applicant)
  if (!applicant) {
    validationErrors.push('Missing Applicant Date of Birth');
    validationErrors.push('Missing Applicant Gender');
  } else {
    const appDob = applicant.dateOfBirth ? applicant.dateOfBirth.split('T')[0] : '';
    const appAge = calculateAgeFromDateOnly(appDob);

    if (!appDob || appAge === null) {
      validationErrors.push('Missing Applicant Date of Birth');
    }
    if (!applicant.gender) {
      validationErrors.push('Missing Applicant Gender');
    }

    people.push({
      member_number: 1,
      relationship: 'Self',
      age: appAge !== null ? appAge : 0,
      applying_for_coverage: applicantCoverage !== false,
      gender: applicant.gender || undefined,
      uses_tobacco: applicant.usesTobacco ?? false,
      annual_income: applicant.annualIncome !== null && applicant.annualIncome !== undefined ? Number(applicant.annualIncome) : undefined
    });
  }

  // 3. Members 2..taxMemberCount
  for (let mNum = 2; mNum <= taxMemberCount; mNum++) {
    const m = taxMembers[mNum];
    if (!m) {
      validationErrors.push(`Missing Date of Birth for Tax Household Member ${mNum}`);
      validationErrors.push(`Missing Relationship for Tax Household Member ${mNum}`);
      continue;
    }

    const mDob = m.date_of_birth ? m.date_of_birth.split('T')[0] : '';
    const mAge = calculateAgeFromDateOnly(mDob);

    if (!mDob || mAge === null) {
      validationErrors.push(`Missing Date of Birth for Tax Household Member ${mNum}`);
    }
    if (!m.relationship_to_applicant) {
      validationErrors.push(`Missing Relationship for Tax Household Member ${mNum}`);
    }

    people.push({
      member_number: mNum,
      relationship: m.relationship_to_applicant || 'Other',
      age: mAge !== null ? mAge : 0,
      applying_for_coverage: m.coverage !== false,
      gender: m.gender || undefined,
      uses_tobacco: m.uses_tobacco ?? false,
      annual_income: m.annual_income !== null && m.annual_income !== undefined ? Number(m.annual_income) : undefined
    });
  }

  // 4. Household Income check
  if (householdIncome === null || householdIncome === undefined || isNaN(Number(householdIncome)) || Number(householdIncome) <= 0) {
    validationErrors.push('Missing household income');
  }

  const householdSize = Math.max(taxMemberCount, people.length);
  const coveredApplicants = people.filter(p => p.applying_for_coverage).length;

  return {
    people,
    householdSize,
    coveredApplicants,
    validationErrors
  };
}

export function buildMarketplaceFingerprint(ctx: {
  planId: string;
  coverageYear: number | string | null;
  zipCode: string | null;
  state: string | null;
  countyFips: string | null;
  householdIncome: number | null;
  householdSize: number;
  people: MarketplacePersonRecord[];
}): string {
  const peopleSig = ctx.people
    .map(p => `${p.member_number}:${p.age}:${p.relationship}:${p.applying_for_coverage}:${p.gender || ''}:${p.uses_tobacco || false}`)
    .join('|');
  return `${(ctx.planId || '').trim().toUpperCase()}_${ctx.coverageYear || ''}_${ctx.zipCode || ''}_${ctx.state || ''}_${ctx.countyFips || ''}_${ctx.householdIncome ?? 'null'}_${ctx.householdSize}_[${peopleSig}]`;
}
