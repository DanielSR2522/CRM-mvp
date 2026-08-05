import { MarketplacePlanPreview, NormalizedBenefit } from './types';

// Helper to format currency accurately without rounding
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return 'Not calculated';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Text Normalization Function
 * Lowercases text, removes punctuation, normalizes slashes, hyphens, ampersands, and collapses whitespace.
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[/\\_-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface CostSharingParseResult {
  display: string;
  copay: number | null;
  coinsurance: number | null;
  bbd: boolean;
  coverageStatus: string;
  networkTier: string;
  secondaryDisplay?: string;
  deductibleApplies: boolean;
}

/**
 * Robust Cost-Sharing Parser
 * Inspects raw benefit object, cost_sharings array, network tiers, and returns precise display strings.
 */
export function parseCostSharing(rawObj: any): CostSharingParseResult {
  // STATE A — RAW BENEFIT ABSENT
  if (!rawObj) {
    return {
      display: 'Not provided by Marketplace API',
      copay: null,
      coinsurance: null,
      bbd: false,
      coverageStatus: 'Not provided by Marketplace API',
      networkTier: 'In-Network',
      deductibleApplies: false
    };
  }

  // STATE C — RAW BENEFIT PRESENT, EXPLICITLY NOT COVERED
  if (rawObj.covered === false) {
    return {
      display: 'Not covered',
      copay: null,
      coinsurance: null,
      bbd: false,
      coverageStatus: 'Not covered',
      networkTier: 'In-Network',
      deductibleApplies: false
    };
  }

  const costSharings: any[] = Array.isArray(rawObj.cost_sharings) ? rawObj.cost_sharings : [];

  // STATE B — RAW BENEFIT PRESENT, COST SHARING EMPTY
  if (costSharings.length === 0) {
    return {
      display: 'Cost sharing not specified',
      copay: null,
      coinsurance: null,
      bbd: false,
      coverageStatus: 'Cost sharing not specified',
      networkTier: 'In-Network',
      deductibleApplies: false
    };
  }

  // Find In-Network Tier 1 or Primary In-Network cost sharing
  let primaryCS = costSharings.find((cs: any) => {
    const tier = (cs.network_tier || '').toLowerCase();
    return tier === 'in-network tier 1' || tier === 'in-network';
  });

  if (!primaryCS) {
    primaryCS = costSharings.find((cs: any) => (cs.network_tier || '').toLowerCase().includes('in-network'));
  }

  if (!primaryCS) {
    primaryCS = costSharings[0];
  }

  // Check for Out-of-Network secondary tier
  const outNetCS = costSharings.find((cs: any) => (cs.network_tier || '').toLowerCase().includes('out-of-network'));
  let secondaryDisplay: string | undefined = undefined;

  if (outNetCS && outNetCS !== primaryCS) {
    const outCopay = typeof outNetCS.copay_amount === 'number' && outNetCS.copay_amount >= 0 ? outNetCS.copay_amount : null;
    const outCoins = typeof outNetCS.coinsurance_rate === 'number' && outNetCS.coinsurance_rate >= 0 ? outNetCS.coinsurance_rate * 100 : null;
    const outBbd = outNetCS.benefit_before_deductible === 'BBD';

    if (outNetCS.display_string && outNetCS.display_string !== 'Not Applicable' && outNetCS.display_string !== 'N/A') {
      secondaryDisplay = `Out-of-network: ${outNetCS.display_string}`;
    } else if (outCopay !== null) {
      secondaryDisplay = `Out-of-network: $${outCopay} copay${outBbd ? '' : ' after deductible'}`;
    } else if (outCoins !== null) {
      secondaryDisplay = `Out-of-network: ${outCoins}% coinsurance${outBbd ? '' : ' after deductible'}`;
    }
  }

  const copay = typeof primaryCS.copay_amount === 'number' && primaryCS.copay_amount >= 0 ? primaryCS.copay_amount : null;
  const coinsurance = typeof primaryCS.coinsurance_rate === 'number' && primaryCS.coinsurance_rate >= 0 ? primaryCS.coinsurance_rate * 100 : null;

  // BBD = Benefit Before Deductible
  const bbd = primaryCS.benefit_before_deductible === 'BBD' ||
    primaryCS.copay_options === 'No Charge' ||
    primaryCS.coinsurance_options === 'No Charge' ||
    (primaryCS.display_string || '').toLowerCase().includes('before deductible') ||
    (primaryCS.display_string || '').toLowerCase().includes('no deductible');

  const deductibleApplies = !bbd && primaryCS.display_string !== 'No Charge';

  let displayStr = '';

  if (primaryCS.display_string && primaryCS.display_string !== 'Not Applicable' && primaryCS.display_string !== 'N/A') {
    displayStr = primaryCS.display_string;
    if (bbd && !displayStr.toLowerCase().includes('deductible') && !displayStr.toLowerCase().includes('no charge')) {
      displayStr += ' (no deductible)';
    }
  } else if (copay !== null && coinsurance !== null) {
    displayStr = `$${copay} copay + ${coinsurance}% coinsurance${deductibleApplies ? ' after deductible' : ' (no deductible)'}`;
  } else if (copay !== null) {
    if (copay === 0) {
      displayStr = `No charge${deductibleApplies ? ' after deductible' : ''}`;
    } else {
      displayStr = `$${copay} copay${deductibleApplies ? ' after deductible' : ' (no deductible)'}`;
    }
  } else if (coinsurance !== null) {
    if (coinsurance === 0) {
      displayStr = `No charge${deductibleApplies ? ' after deductible' : ''}`;
    } else {
      displayStr = `${coinsurance}% coinsurance${deductibleApplies ? ' after deductible' : ' (no deductible)'}`;
    }
  } else if (primaryCS.copay_options === 'No Charge' || primaryCS.coinsurance_options === 'No Charge') {
    displayStr = `No charge${deductibleApplies ? ' after deductible' : ''}`;
  } else {
    displayStr = 'Covered, cost sharing not specified';
  }

  return {
    display: displayStr,
    copay: copay,
    coinsurance: coinsurance,
    bbd: bbd,
    coverageStatus: 'Covered',
    networkTier: primaryCS.network_tier || 'In-Network',
    secondaryDisplay: secondaryDisplay,
    deductibleApplies: deductibleApplies
  };
}

interface TargetBenefitSpec {
  category: string;
  serviceName: string;
  keywords: string[];
}

const TARGET_BENEFITS: TargetBenefitSpec[] = [
  // Doctor Visits
  { category: 'Doctor Visits', serviceName: 'Primary Care Visit', keywords: ['primary care', 'pcp', 'primary care physician', 'primary care visit', 'primary_care_visit'] },
  { category: 'Doctor Visits', serviceName: 'Specialist Visit', keywords: ['specialist', 'specialist visit', 'specialist care', 'specialist physician', 'specialist_visit'] },
  { category: 'Doctor Visits', serviceName: 'Preventive Care', keywords: ['preventive', 'preventative', 'preventive care', 'immunization', 'screening'] },
  { category: 'Doctor Visits', serviceName: 'Telehealth', keywords: ['telehealth', 'virtual visit', 'telemedicine', 'virtual care', 'remote care', 'e visit', 'online visit', 'video visit'] },

  // Tests and Diagnostic Services
  { category: 'Tests and Diagnostic Services', serviceName: 'Laboratory Tests', keywords: ['laboratory', 'lab services', 'lab test', 'clinical laboratory', 'diagnostic laboratory', 'laboratory outpatient'] },
  { category: 'Tests and Diagnostic Services', serviceName: 'X-rays', keywords: ['x rays', 'xray', 'x ray', 'diagnostic x ray', 'basic diagnostic imaging', 'radiology services'] },
  { category: 'Tests and Diagnostic Services', serviceName: 'Diagnostic Imaging', keywords: ['diagnostic imaging', 'x-rays and diagnostic imaging', 'advanced diagnostic imaging', 'imaging services', 'diagnostic radiology', 'advanced radiology'] },
  { category: 'Tests and Diagnostic Services', serviceName: 'MRI', keywords: ['mri', 'magnetic resonance imaging'] },
  { category: 'Tests and Diagnostic Services', serviceName: 'CT Scan', keywords: ['ct scan', 'ct scans', 'computed tomography', 'computerized tomography', 'ct/pet', 'imaging ct pet scans mris'] },
  { category: 'Tests and Diagnostic Services', serviceName: 'PET Scan', keywords: ['pet scan', 'pet scans', 'positron emission tomography', 'ct/pet', 'imaging ct pet scans mris'] },

  // Urgent and Emergency Care
  { category: 'Urgent and Emergency Care', serviceName: 'Urgent Care', keywords: ['urgent care', 'urgent care facility', 'urgent care centers', 'urgent_care_centers'] },
  { category: 'Urgent and Emergency Care', serviceName: 'Emergency Room', keywords: ['emergency room', 'emergency department', 'emergency room services', 'emergency_room_services', 'emergency facility'] },
  { category: 'Urgent and Emergency Care', serviceName: 'Ambulance', keywords: ['ambulance', 'ground ambulance', 'emergency transportation', 'emergency medical transportation'] },

  // Hospital and Surgery
  { category: 'Hospital and Surgery', serviceName: 'Inpatient Hospital', keywords: ['inpatient hospital', 'hospital stay', 'inpatient facility', 'inpatient hospitalization'] },
  { category: 'Hospital and Surgery', serviceName: 'Outpatient Hospital', keywords: ['outpatient hospital', 'outpatient facility', 'hospital outpatient'] },
  { category: 'Hospital and Surgery', serviceName: 'Outpatient Surgery', keywords: ['outpatient surgery', 'ambulatory surgical', 'ambulatory surgery', 'outpatient surgical'] },
  { category: 'Hospital and Surgery', serviceName: 'Physician and Surgeon Fees', keywords: ['physician and surgeon', 'surgeon fees', 'inpatient physician', 'professional services', 'physician services'] },

  // Prescription Drugs
  { category: 'Prescription Drugs', serviceName: 'Generic Drugs', keywords: ['generic', 'generic drugs', 'preferred generic', 'tier 1', 'generic_drugs'] },
  { category: 'Prescription Drugs', serviceName: 'Preferred Brand Drugs', keywords: ['preferred brand', 'preferred brand drugs', 'tier 2'] },
  { category: 'Prescription Drugs', serviceName: 'Non-Preferred Brand Drugs', keywords: ['non preferred brand', 'non preferred brand drugs', 'non preferred drugs', 'tier 3'] },
  { category: 'Prescription Drugs', serviceName: 'Specialty Drugs', keywords: ['specialty', 'specialty drugs', 'high cost drugs', 'tier 4'] },
  { category: 'Prescription Drugs', serviceName: 'Mail Order', keywords: ['mail order', 'mail-order', 'home delivery', 'prescription delivery', 'mail service pharmacy', '90-day supply', 'mail order prescription drugs'] },

  // Additional Important Medical Benefits
  { category: 'Additional Important Medical Benefits', serviceName: 'Mental Health Outpatient', keywords: ['mental health outpatient', 'mental behavioral health outpatient', 'behavioral health outpatient', 'substance abuse outpatient', 'substance use outpatient'] },
  { category: 'Additional Important Medical Benefits', serviceName: 'Mental Health Inpatient', keywords: ['mental health inpatient', 'mental behavioral health inpatient', 'behavioral health inpatient', 'substance abuse inpatient', 'substance use inpatient'] },
  { category: 'Additional Important Medical Benefits', serviceName: 'Maternity', keywords: ['maternity', 'prenatal', 'postnatal', 'childbirth', 'delivery and all inpatient'] },
  { category: 'Additional Important Medical Benefits', serviceName: 'Rehabilitation', keywords: ['rehabilitation', 'habilitative', 'physical therapy', 'occupational therapy', 'speech therapy', 'rehabilitative'] },
  { category: 'Additional Important Medical Benefits', serviceName: 'Skilled Nursing', keywords: ['skilled nursing', 'snf'] },
  { category: 'Additional Important Medical Benefits', serviceName: 'Home Health', keywords: ['home health', 'home health care'] },
  { category: 'Additional Important Medical Benefits', serviceName: 'Durable Medical Equipment', keywords: ['durable medical', 'dme', 'medical equipment'] },
  { category: 'Additional Important Medical Benefits', serviceName: 'Hospice', keywords: ['hospice'] },

  // Dental and Vision
  { category: 'Dental and Vision', serviceName: 'Adult Dental', keywords: ['adult dental', 'dental care adult'] },
  { category: 'Dental and Vision', serviceName: 'Child Dental', keywords: ['child dental', 'pediatric dental', 'dental check up for children'] },
  { category: 'Dental and Vision', serviceName: 'Adult Vision', keywords: ['adult vision', 'routine eye exam adult'] },
  { category: 'Dental and Vision', serviceName: 'Child Vision', keywords: ['child vision', 'pediatric vision', 'eye exam for children', 'glasses for children'] }
];

export function normalizeMarketplacePlan(rawPlan: any, taxCreditEstimate: number | null = null): MarketplacePlanPreview {
  const fullPremium = Number(rawPlan.premium || 0);
  let taxCredit = taxCreditEstimate !== null ? taxCreditEstimate : (rawPlan.premium_w_credit !== undefined && rawPlan.premium_w_credit < fullPremium ? (fullPremium - rawPlan.premium_w_credit) : 0);

  if (taxCredit > fullPremium) taxCredit = fullPremium;

  const netPremium = Math.max(0, fullPremium - taxCredit);
  const annualPremium = netPremium * 12;

  // Extract Deductibles with Combined vs Medical vs Drug distinction & Family vs Individual mapping
  let dedInd: number | null = null;
  let dedFam: number | null = null;
  let drugDedInd: number | null = null;
  let drugDedFam: number | null = null;
  let isCombinedDeductible = false;
  let deductibleType = 'Medical Deductible';

  if (Array.isArray(rawPlan.deductibles)) {
    rawPlan.deductibles.forEach((d: any) => {
      const type = (d.type || '').toLowerCase();
      const isFam = !!d.family || d.family_cost === 'Family';
      const isInd = !!d.individual || d.family_cost === 'Individual';

      if (type.includes('combined')) {
        isCombinedDeductible = true;
        deductibleType = 'Combined Medical and Drug Deductible';
        if (isInd && dedInd === null) dedInd = d.amount;
        if (isFam && dedFam === null) dedFam = d.amount;
      } else if (type.includes('drug') || type.includes('prescription')) {
        if (isInd && drugDedInd === null) drugDedInd = d.amount;
        if (isFam && drugDedFam === null) drugDedFam = d.amount;
      } else {
        if (isInd && dedInd === null) dedInd = d.amount;
        if (isFam && dedFam === null) dedFam = d.amount;
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
      const isFam = !!m.family || m.family_cost === 'Family';
      const isInd = !!m.individual || m.family_cost === 'Individual';
      if (isInd && oopInd === null) oopInd = m.amount;
      if (isFam && oopFam === null) oopFam = m.amount;
    });
  }

  // Extract Raw Benefits Array
  const rawBenefits: any[] = Array.isArray(rawPlan.benefits) ? rawPlan.benefits : [];
  const usedRawIndices = new Set<number>();
  const normalizedBenefits: NormalizedBenefit[] = [];
  let sortIdx = 1;

  const benefitsWithoutCostSharing: string[] = [];
  const benefitsWithMultipleNetworkTiers: string[] = [];

  // Match each target benefit spec
  TARGET_BENEFITS.forEach(spec => {
    let matchedRawIdx = -1;
    let isCombinedImaging = false;

    // Search unused raw benefits for best keyword match
    for (let i = 0; i < rawBenefits.length; i++) {
      if (usedRawIndices.has(i)) continue;
      const b = rawBenefits[i];
      const normName = normalizeText(b.name || '');
      const normType = normalizeText(b.type || '');

      const isMatch = spec.keywords.some(kw => normName.includes(kw) || normType.includes(kw));
      if (isMatch) {
        matchedRawIdx = i;
        break;
      }
    }

    let rawObj: any = null;
    if (matchedRawIdx >= 0) {
      usedRawIndices.add(matchedRawIdx);
      rawObj = rawBenefits[matchedRawIdx];
    }

    // Special Handling for Target 5 rows: Diagnostic Imaging, CT Scan, PET Scan, Telehealth, Mail Order
    if (spec.serviceName === 'Diagnostic Imaging' && !rawObj) {
      const diagRaw = rawBenefits.find(b => {
        const norm = normalizeText(b.name || '');
        const normType = normalizeText(b.type || '');
        return norm.includes('diagnostic imaging') || norm.includes('x rays') || normType.includes('x_rays');
      });
      if (diagRaw) rawObj = diagRaw;
    } else if ((spec.serviceName === 'CT Scan' || spec.serviceName === 'PET Scan') && !rawObj) {
      const combinedRaw = rawBenefits.find(b => {
        const norm = normalizeText(b.name || '');
        const normType = normalizeText(b.type || '');
        return (norm.includes('ct') && norm.includes('pet')) || normType.includes('ct_pet') || norm.includes('imaging ct pet');
      });
      if (combinedRaw) {
        rawObj = combinedRaw;
        isCombinedImaging = true;
      }
    }

    const parsed = parseCostSharing(rawObj);

    // Apply specific display rules for Telehealth & Mail Order if not listed separately
    if (spec.serviceName === 'Telehealth' && !rawObj) {
      parsed.display = 'Not listed separately by Marketplace';
      parsed.coverageStatus = 'Not listed separately by Marketplace';
    } else if (spec.serviceName === 'Mail Order' && !rawObj) {
      parsed.display = 'Not listed separately by Marketplace';
      parsed.coverageStatus = 'Not listed separately by Marketplace';
    }

    if (rawObj) {
      const csCount = Array.isArray(rawObj.cost_sharings) ? rawObj.cost_sharings.length : 0;
      if (csCount === 0) benefitsWithoutCostSharing.push(rawObj.name || rawObj.type || spec.serviceName);
      if (csCount > 1) benefitsWithMultipleNetworkTiers.push(rawObj.name || rawObj.type || spec.serviceName);
    }

    let limitations = '';
    if (rawObj) {
      if (rawObj.explanation) limitations = rawObj.explanation;
      if (rawObj.has_limits && rawObj.limit_quantity) {
        limitations += `${limitations ? ' ' : ''}(Limit: ${rawObj.limit_quantity} ${rawObj.limit_unit || 'visits'})`;
      }
    }

    let notes = rawObj ? (rawObj.exclusions || '') : '';
    if (isCombinedImaging) {
      notes = notes ? `${notes} (Source: Combined CT/PET imaging benefit)` : 'Source: Combined CT/PET imaging benefit';
    }

    normalizedBenefits.push({
      category: spec.category,
      serviceName: spec.serviceName,
      copayAmount: parsed.copay,
      coinsurancePercentage: parsed.coinsurance,
      deductibleApplies: parsed.deductibleApplies,
      coverageStatus: parsed.coverageStatus,
      individualValue: parsed.display,
      familyValue: parsed.display,
      limitations: limitations.trim(),
      notes: notes,
      sourceText: rawObj ? JSON.stringify(rawObj) : '',
      sourceUrl: rawPlan.benefits_url || '',
      sortOrder: sortIdx++,
      networkTier: parsed.networkTier,
      secondaryDisplay: parsed.secondaryDisplay,
      rawName: rawObj ? (rawObj.name || rawObj.type) : undefined,
      isUnmapped: false
    });
  });

  // FALLBACK SECTION: OTHER MARKETPLACE BENEFITS (Unmapped raw benefits)
  const unmappedBenefits: any[] = [];
  for (let i = 0; i < rawBenefits.length; i++) {
    if (!usedRawIndices.has(i)) {
      const unmappedObj = rawBenefits[i];
      unmappedBenefits.push(unmappedObj);

      const parsed = parseCostSharing(unmappedObj);
      const rawName = unmappedObj.name || unmappedObj.type || `Marketplace Benefit ${i + 1}`;

      let limitations = '';
      if (unmappedObj.explanation) limitations = unmappedObj.explanation;
      if (unmappedObj.has_limits && unmappedObj.limit_quantity) {
        limitations += `${limitations ? ' ' : ''}(Limit: ${unmappedObj.limit_quantity} ${unmappedObj.limit_unit || 'visits'})`;
      }

      normalizedBenefits.push({
        category: 'Other Marketplace Benefits',
        serviceName: rawName,
        copayAmount: parsed.copay,
        coinsurancePercentage: parsed.coinsurance,
        deductibleApplies: parsed.deductibleApplies,
        coverageStatus: parsed.coverageStatus,
        individualValue: parsed.display,
        familyValue: parsed.display,
        limitations: limitations.trim(),
        notes: unmappedObj.exclusions || '',
        sourceText: JSON.stringify(unmappedObj),
        sourceUrl: rawPlan.benefits_url || '',
        sortOrder: sortIdx++,
        networkTier: parsed.networkTier,
        secondaryDisplay: parsed.secondaryDisplay,
        rawName: rawName,
        isUnmapped: true
      });
    }
  }

  // Development Audit Data
  const audit = {
    planId: rawPlan.id || 'UNKNOWN',
    rawBenefitCount: rawBenefits.length,
    mappedBenefitCount: TARGET_BENEFITS.length - (normalizedBenefits.filter(b => b.coverageStatus === 'Not provided by Marketplace API' || b.coverageStatus === 'Not listed separately by Marketplace').length),
    unmappedBenefitCount: unmappedBenefits.length,
    unmappedBenefitNames: unmappedBenefits.map(b => b.name || b.type || 'Unnamed'),
    benefitsWithoutCostSharing: benefitsWithoutCostSharing,
    benefitsWithMultipleNetworkTiers: benefitsWithMultipleNetworkTiers
  };

  if (process.env.NODE_ENV !== 'production') {
    console.log('[MARKETPLACE_BENEFIT_AUDIT]', audit);
  }

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
    isCombinedDeductible: isCombinedDeductible,
    deductibleType: deductibleType,
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
    rawPlan: rawPlan,
    audit: audit
  };
}
