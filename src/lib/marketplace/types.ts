export interface MarketplaceHouseholdPerson {
  age: number;
  gender?: 'Male' | 'Female' | string;
  uses_tobacco?: boolean;
  aptc_eligible?: boolean;
  utilization?: 'Low' | 'Medium' | 'High' | string;
  utilization_level?: 'Low' | 'Medium' | 'High' | string;
  relationship?: 'Self' | 'Spouse' | 'Child' | string;
}

export interface MarketplaceSearchPayload {
  planId: string;
  coverageYear: number;
  zipCode: string;
  countyFips?: string;
  state?: string;
  householdIncome?: number;
  people?: MarketplaceHouseholdPerson[];
}

export interface NormalizedBenefit {
  category: string;
  serviceName: string;
  copayAmount: number | null;
  coinsurancePercentage: number | null;
  deductibleApplies: boolean;
  coverageStatus: string; // e.g. "Covered", "Not Covered", "Not Provided"
  individualValue: string;
  familyValue: string;
  limitations: string;
  notes: string;
  sourceText: string;
  sourceUrl: string;
  sortOrder: number;
}

export interface MarketplacePlanPreview {
  id: string; // Exact Plan ID (e.g. 21525FL0020016)
  issuerName: string;
  planName: string;
  coverageYear: number;
  metalLevel: string;
  planType: string;
  networkType: string;
  premiumFull: number;
  taxCredit: number; // APTC
  premiumNet: number; // Final monthly premium
  premiumAnnual: number; // Final annual premium
  deductibleIndividual: number | null;
  deductibleFamily: number | null;
  drugDeductibleIndividual: number | null;
  drugDeductibleFamily: number | null;
  oopMaxIndividual: number | null;
  oopMaxFamily: number | null;
  hsaEligible?: boolean;
  benefitsUrl?: string;
  brochureUrl?: string;
  formularyUrl?: string;
  networkUrl?: string;
  benefits: NormalizedBenefit[];
  rawPlan: any;
}

export interface MarketplacePlanSnapshot {
  id?: string;
  agent_id?: string | null;
  client_id: string;
  health_policy_id: string;
  plan_id: string;
  coverage_year: number;
  issuer_name: string | null;
  plan_name: string | null;
  metal_level: string | null;
  plan_type: string | null;
  network_type: string | null;
  premium_full: number | null;
  tax_credit: number | null;
  premium_net: number | null;
  premium_annual: number | null;
  deductible_individual: number | null;
  deductible_family: number | null;
  drug_deductible_individual: number | null;
  drug_deductible_family: number | null;
  oop_max_individual: number | null;
  oop_max_family: number | null;
  raw_response?: any;
  fetched_at?: string;
  applied_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MarketplacePlanBenefitRecord {
  id?: string;
  snapshot_id: string;
  category: string;
  service_name: string;
  copay_amount: number | null;
  coinsurance_percentage: number | null;
  deductible_applies: boolean;
  coverage_status: string | null;
  individual_value: string | null;
  family_value: string | null;
  limitations: string | null;
  notes: string | null;
  source_text: string | null;
  source_url: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}
