import { MarketplacePlanPreview, NormalizedBenefit } from './types';

// Helper to format currency accurately without rounding
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return 'Not calculated';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Extract display string for cost sharing object
export function getCostSharingString(benefitObj: any): { display: string; copay: number | null; coinsurance: number | null; bbd: boolean } {
  if (!benefitObj || !benefitObj.cost_sharings || benefitObj.cost_sharings.length === 0) {
    return { display: 'Not provided by Marketplace API', copay: null, coinsurance: null, bbd: false };
  }

  // Find In-Network cost sharing
  const inNet = benefitObj.cost_sharings.find((cs: any) => cs.network_tier === 'In-Network') || benefitObj.cost_sharings[0];
  
  if (!inNet) {
    return { display: 'Not provided by Marketplace API', copay: null, coinsurance: null, bbd: false };
  }

  const copay = typeof inNet.copay_amount === 'number' && inNet.copay_amount > 0 ? inNet.copay_amount : null;
  const coinsurance = typeof inNet.coinsurance_rate === 'number' && inNet.coinsurance_rate > 0 ? inNet.coinsurance_rate * 100 : null;
  const bbd = inNet.benefit_before_deductible === 'BBD';

  if (inNet.display_string && inNet.display_string !== 'Not Applicable') {
    let str = inNet.display_string;
    if (bbd && !str.toLowerCase().includes('before deductible')) {
      str += ' (no deductible)';
    }
    return { display: str, copay, coinsurance, bbd };
  }

  if (copay !== null && coinsurance !== null) {
    return { display: `$${copay} + ${coinsurance}% coinsurance${bbd ? '' : ' after deductible'}`, copay, coinsurance, bbd };
  }
  if (copay !== null) {
    return { display: `$${copay} copay`, copay, coinsurance: null, bbd };
  }
  if (coinsurance !== null) {
    return { display: `${coinsurance}% coinsurance${bbd ? '' : ' after deductible'}`, copay: null, coinsurance, bbd };
  }
  if (inNet.coinsurance_rate === 0 && inNet.copay_amount === 0) {
    return { display: 'Covered at no charge', copay: 0, coinsurance: 0, bbd: true };
  }

  return { display: 'See plan documents', copay: null, coinsurance: null, bbd };
}

export function normalizeMarketplacePlan(rawPlan: any, taxCreditEstimate: number | null = null): MarketplacePlanPreview {
  const fullPremium = Number(rawPlan.premium || 0);
  let taxCredit = taxCreditEstimate !== null ? taxCreditEstimate : (rawPlan.premium_w_credit !== undefined && rawPlan.premium_w_credit < fullPremium ? (fullPremium - rawPlan.premium_w_credit) : 0);
  
  // Ensure taxCredit does not exceed full premium
  if (taxCredit > fullPremium) taxCredit = fullPremium;
  
  const netPremium = Math.max(0, fullPremium - taxCredit);
  const annualPremium = netPremium * 12;

  // Extract Deductibles
  let dedInd: number | null = null;
  let dedFam: number | null = null;
  let drugDedInd: number | null = null;
  let drugDedFam: number | null = null;

  if (Array.isArray(rawPlan.deductibles)) {
    rawPlan.deductibles.forEach((d: any) => {
      const type = (d.type || '').toLowerCase();
      if (type.includes('drug') || type.includes('prescription')) {
        if (d.individual) drugDedInd = d.amount;
        if (d.family) drugDedFam = d.amount;
      } else {
        if (d.individual && dedInd === null) dedInd = d.amount;
        if (d.family && dedFam === null) dedFam = d.amount;
      }
    });
  }

  // Fallback to raw fields if present
  if (dedInd === null && typeof rawPlan.deductible === 'number') dedInd = rawPlan.deductible;

  // Extract OOP Maximums
  let oopInd: number | null = null;
  let oopFam: number | null = null;
  if (Array.isArray(rawPlan.moops)) {
    rawPlan.moops.forEach((m: any) => {
      if (m.individual && oopInd === null) oopInd = m.amount;
      if (m.family && oopFam === null) oopFam = m.amount;
    });
  }

  // Build Normalized Benefits Array across the 11 categories
  const rawBenefits = Array.isArray(rawPlan.benefits) ? rawPlan.benefits : [];
  const getRawBenefit = (typeSubstring: string) => {
    return rawBenefits.find((b: any) => (b.type || '').toUpperCase().includes(typeSubstring.toUpperCase()) || (b.name || '').toUpperCase().includes(typeSubstring.toUpperCase()));
  };

  const normalizedBenefits: NormalizedBenefit[] = [];
  let sortIdx = 1;

  const addBenefit = (cat: string, name: string, rawObj: any, defaultFallback = 'See plan documents') => {
    let csString = defaultFallback;
    let copay: number | null = null;
    let coinsurance: number | null = null;
    let bbd = false;
    let status = 'Covered';
    let limitations = '';

    if (rawObj) {
      if (rawObj.covered === false) {
        status = 'Not covered';
        csString = 'Not covered';
      } else {
        const parsed = getCostSharingString(rawObj);
        csString = parsed.display;
        copay = parsed.copay;
        coinsurance = parsed.coinsurance;
        bbd = parsed.bbd;
      }
      if (rawObj.explanation) limitations = rawObj.explanation;
      if (rawObj.has_limits && rawObj.limit_quantity) {
        limitations += ` (Limit: ${rawObj.limit_quantity} ${rawObj.limit_unit || 'visits'})`;
      }
    } else {
      status = 'Not provided by Marketplace API';
      csString = 'Not provided by Marketplace API';
    }

    normalizedBenefits.push({
      category: cat,
      serviceName: name,
      copayAmount: copay,
      coinsurancePercentage: coinsurance,
      deductibleApplies: !bbd,
      coverageStatus: status,
      individualValue: csString,
      familyValue: csString,
      limitations: limitations.trim(),
      notes: rawObj ? (rawObj.exclusions || '') : '',
      sourceText: rawObj ? JSON.stringify(rawObj) : '',
      sourceUrl: rawPlan.benefits_url || '',
      sortOrder: sortIdx++
    });
  };

  // Section 4: Doctor Visits
  addBenefit('Doctor Visits', 'Primary Care Visit', getRawBenefit('PRIMARY_CARE'));
  addBenefit('Doctor Visits', 'Specialist Visit', getRawBenefit('SPECIALIST'));
  addBenefit('Doctor Visits', 'Preventive Care', getRawBenefit('PREVENTIVE'));
  addBenefit('Doctor Visits', 'Telehealth', getRawBenefit('TELEHEALTH') || getRawBenefit('OTHER_PRACTITIONER'));

  // Section 5: Tests and Diagnostic Services
  addBenefit('Tests and Diagnostic Services', 'Laboratory Tests', getRawBenefit('LABORATORY'));
  addBenefit('Tests and Diagnostic Services', 'X-rays', getRawBenefit('X_RAY'));
  addBenefit('Tests and Diagnostic Services', 'Diagnostic Imaging', getRawBenefit('DIAGNOSTIC'));
  addBenefit('Tests and Diagnostic Services', 'MRI', getRawBenefit('IMAGING') || getRawBenefit('MRI'));
  addBenefit('Tests and Diagnostic Services', 'CT Scan', getRawBenefit('CT') || getRawBenefit('IMAGING'));
  addBenefit('Tests and Diagnostic Services', 'PET Scan', getRawBenefit('PET') || getRawBenefit('IMAGING'));

  // Section 6: Urgent and Emergency Care
  addBenefit('Urgent and Emergency Care', 'Urgent Care', getRawBenefit('URGENT_CARE'));
  addBenefit('Urgent and Emergency Care', 'Emergency Room', getRawBenefit('EMERGENCY_ROOM'));
  addBenefit('Urgent and Emergency Care', 'Ambulance', getRawBenefit('EMERGENCY_MEDICAL_TRANSPORTATION'));

  // Section 7: Hospital and Surgery
  addBenefit('Hospital and Surgery', 'Inpatient Hospital', getRawBenefit('INPATIENT_HOSPITAL'));
  addBenefit('Hospital and Surgery', 'Outpatient Hospital', getRawBenefit('OUTPATIENT_FACILITY'));
  addBenefit('Hospital and Surgery', 'Outpatient Surgery', getRawBenefit('OUTPATIENT_SURGERY'));
  addBenefit('Hospital and Surgery', 'Physician and Surgeon Fees', getRawBenefit('PHYSICIAN_SURGEON'));

  // Section 8: Prescription Drugs
  addBenefit('Prescription Drugs', 'Generic Drugs', getRawBenefit('GENERIC_DRUGS'));
  addBenefit('Prescription Drugs', 'Preferred Brand Drugs', getRawBenefit('PREFERRED_BRAND_DRUGS'));
  addBenefit('Prescription Drugs', 'Non-Preferred Brand Drugs', getRawBenefit('NON_PREFERRED_BRAND_DRUGS'));
  addBenefit('Prescription Drugs', 'Specialty Drugs', getRawBenefit('SPECIALTY_DRUGS'));
  addBenefit('Prescription Drugs', 'Mail Order', getRawBenefit('MAIL_ORDER') || (rawPlan.rx_3mo_mail_order ? { covered: true, cost_sharings: [{ display_string: 'Mail Order Available' }] } : null));

  // Section 9: Additional Important Medical Benefits
  addBenefit('Additional Important Medical Benefits', 'Mental Health Outpatient', getRawBenefit('MENTAL_BEHAVIORAL_HEALTH_OUTPATIENT'));
  addBenefit('Additional Important Medical Benefits', 'Mental Health Inpatient', getRawBenefit('MENTAL_BEHAVIORAL_HEALTH_INPATIENT'));
  addBenefit('Additional Important Medical Benefits', 'Maternity', getRawBenefit('MATERNITY') || getRawBenefit('PRENATAL'));
  addBenefit('Additional Important Medical Benefits', 'Rehabilitation', getRawBenefit('REHABILITATION'));
  addBenefit('Additional Important Medical Benefits', 'Skilled Nursing', getRawBenefit('SKILLED_NURSING'));
  addBenefit('Additional Important Medical Benefits', 'Home Health', getRawBenefit('HOME_HEALTH'));
  addBenefit('Additional Important Medical Benefits', 'Durable Medical Equipment', getRawBenefit('DURABLE_MEDICAL'));
  addBenefit('Additional Important Medical Benefits', 'Hospice', getRawBenefit('HOSPICE'));

  // Section 10: Dental and Vision
  addBenefit('Dental and Vision', 'Adult Dental', getRawBenefit('DENTAL_CARE_ADULT'));
  addBenefit('Dental and Vision', 'Child Dental', getRawBenefit('DENTAL_CHECK_UP_CHILD') || getRawBenefit('DENTAL_CARE_CHILD'));
  addBenefit('Dental and Vision', 'Adult Vision', getRawBenefit('ROUTINE_EYE_EXAM_ADULT'));
  addBenefit('Dental and Vision', 'Child Vision', getRawBenefit('ROUTINE_EYE_EXAM_CHILD') || getRawBenefit('EYE_EXAM_CHILD'));

  return {
    id: rawPlan.id,
    issuerName: rawPlan.issuer ? rawPlan.issuer.name : 'Unknown Carrier',
    planName: rawPlan.name || 'Marketplace Plan',
    coverageYear: rawPlan.year || 2026,
    metalLevel: rawPlan.metal_level || 'Marketplace',
    planType: rawPlan.type || 'HMO',
    networkType: rawPlan.type || 'HMO',
    premiumFull: fullPremium,
    taxCredit: taxCredit,
    premiumNet: netPremium,
    premiumAnnual: annualPremium,
    deductibleIndividual: dedInd,
    deductibleFamily: dedFam,
    drugDeductibleIndividual: drugDedInd,
    drugDeductibleFamily: drugDedFam,
    oopMaxIndividual: oopInd,
    oopMaxFamily: oopFam,
    hsaEligible: !!rawPlan.hsa_eligible,
    benefitsUrl: rawPlan.benefits_url || '',
    brochureUrl: rawPlan.brochure_url || '',
    formularyUrl: rawPlan.formulary_url || '',
    networkUrl: rawPlan.network_url || '',
    benefits: normalizedBenefits,
    rawPlan: rawPlan
  };
}
