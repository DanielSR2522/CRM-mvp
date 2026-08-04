import { HealthTaxHouseholdMember } from '@/lib/health/types';

export interface MarketplacePersonRecord {
  memberId: string;
  memberNumber: number;
  relationship: string;
  dateOfBirth: string;
  age: number;
  gender: string;
  usesTobacco: boolean;
  applyingForCoverage: boolean;
  annualIncome: number;
  aptcEligible: boolean;
}

export interface TransformationResult {
  success: boolean;
  people: MarketplacePersonRecord[];
  errors: string[];
}

export function calculateAgeFromDob(dobStr: string | null | undefined): number | null {
  if (!dobStr) return null;
  const parts = dobStr.split('T')[0].split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = (today.getMonth() + 1) - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) {
    age--;
  }
  return age >= 0 ? age : null;
}

export function transformHouseholdToMarketplacePeople(
  applicant: {
    dob?: string | null;
    gender?: string | null;
    usesTobacco?: boolean | null;
    annualIncome?: number | null;
    applyingForCoverage?: boolean | null;
  },
  membersMap: { [memberNumber: number]: HealthTaxHouseholdMember }
): TransformationResult {
  const people: MarketplacePersonRecord[] = [];
  const errors: string[] = [];

  // Member 1 (Applicant)
  const appAge = calculateAgeFromDob(applicant.dob);
  if (appAge === null) {
    errors.push('Applicant (Member 1): Valid Date of Birth is required to calculate age.');
  }
  if (!applicant.gender) {
    errors.push('Applicant (Member 1): Gender is required.');
  }

  people.push({
    memberId: 'applicant_1',
    memberNumber: 1,
    relationship: 'Self',
    dateOfBirth: applicant.dob ? applicant.dob.split('T')[0] : '',
    age: appAge || 0,
    gender: applicant.gender || 'Male',
    usesTobacco: applicant.usesTobacco ?? false,
    applyingForCoverage: applicant.applyingForCoverage ?? true,
    annualIncome: Number(applicant.annualIncome || 0),
    aptcEligible: true
  });

  // Additional Members (Member 2, 3, etc.)
  const memberNumbers = Object.keys(membersMap).map(Number).sort((a, b) => a - b);

  for (const mNum of memberNumbers) {
    if (mNum < 2) continue;
    const m = membersMap[mNum];
    if (!m) continue;

    const label = `Tax Household Member ${mNum} (${m.full_name || 'Unnamed'})`;

    if (!m.full_name || !m.full_name.trim()) {
      errors.push(`${label}: Full Name is required.`);
    }

    const age = calculateAgeFromDob(m.date_of_birth);
    if (age === null) {
      errors.push(`${label}: Valid Date of Birth is required.`);
    }

    if (!m.relationship_to_applicant) {
      errors.push(`${label}: Relationship to Applicant is required.`);
    }

    people.push({
      memberId: m.id || `member_${mNum}`,
      memberNumber: mNum,
      relationship: m.relationship_to_applicant || 'Dependent',
      dateOfBirth: m.date_of_birth ? m.date_of_birth.split('T')[0] : '',
      age: age || 0,
      gender: m.gender || 'Male',
      usesTobacco: !!m.uses_tobacco,
      applyingForCoverage: !!m.coverage,
      annualIncome: Number(m.annual_income || 0),
      aptcEligible: true
    });
  }

  return {
    success: errors.length === 0,
    people,
    errors
  };
}
