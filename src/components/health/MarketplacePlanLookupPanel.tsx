import React, { useState, useEffect } from 'react';
import { MarketplacePlanPreview, NormalizedBenefit } from '@/lib/marketplace/types';
import { formatCurrency } from '@/lib/marketplace/normalizer';

interface MarketplacePlanLookupPanelProps {
  initialPlanId?: string;
  initialYear?: string;
  initialZip?: string;
  initialCounty?: string;
  initialState?: string;
  householdIncome?: number;
  peopleCount?: number;
  isEditing: boolean;
  onApplyPlan: (plan: MarketplacePlanPreview) => void;
  appliedPlan: MarketplacePlanPreview | null;
  addToast: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
}

export default function MarketplacePlanLookupPanel({
  initialPlanId = '',
  initialYear = '2026',
  initialZip = '',
  initialCounty = '',
  initialState = '',
  householdIncome = 45000,
  peopleCount = 1,
  isEditing,
  onApplyPlan,
  appliedPlan,
  addToast
}: MarketplacePlanLookupPanelProps) {
  const [planIdInput, setPlanIdInput] = useState(initialPlanId);
  const [yearInput, setYearInput] = useState(initialYear || '2026');
  const [zipInput, setZipInput] = useState(initialZip);
  const [countyInput, setCountyInput] = useState(initialCounty);
  const [stateInput, setStateInput] = useState(initialState);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [foundPlan, setFoundPlan] = useState<MarketplacePlanPreview | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isBenefitsCollapsed, setIsBenefitsCollapsed] = useState(true);

  // Sync initial props into inputs
  useEffect(() => {
    if (initialPlanId && !planIdInput) setPlanIdInput(initialPlanId);
    if (initialYear && (!yearInput || yearInput === '2026')) setYearInput(initialYear);
    if (initialZip && !zipInput) setZipInput(initialZip);
    if (initialCounty && !countyInput) setCountyInput(initialCounty);
    if (initialState && !stateInput) setStateInput(initialState);
  }, [initialPlanId, initialYear, initialZip, initialCounty, initialState]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setFoundPlan(null);

    const cleanPlanId = planIdInput.trim().toUpperCase();
    const cleanZip = zipInput.trim();

    if (!cleanPlanId) {
      setErrorMsg('Please enter a Plan ID to search (e.g. 21525FL0020016).');
      return;
    }
    if (!cleanZip || !/^\d{5}$/.test(cleanZip)) {
      setErrorMsg('Please enter a valid 5-digit ZIP code.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/marketplace/plan-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: cleanPlanId,
          coverageYear: yearInput || '2026',
          zipCode: cleanZip,
          countyFips: countyInput,
          state: stateInput,
          householdIncome: householdIncome || 45000,
          people: [{ age: 35, gender: 'Male', uses_tobacco: false }]
        })
      });

      const data = await res.json();
      if (!res.ok || !data.found) {
        setErrorMsg(data.message || 'Plan not found for this year and service area.');
      } else {
        setFoundPlan(data.plan);
      }
    } catch (err: any) {
      console.error('Marketplace search request failed:', err);
      setErrorMsg(err?.message || 'Failed to connect to Marketplace API service.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setPlanIdInput('');
    setErrorMsg(null);
    setFoundPlan(null);
  };

  const handleCancelPreview = () => {
    setFoundPlan(null);
    setErrorMsg(null);
  };

  const handleConfirmApply = () => {
    if (foundPlan) {
      onApplyPlan(foundPlan);
      setShowConfirmModal(false);
      setIsBenefitsCollapsed(false); // Auto-expand once on successful apply
      addToast({
        title: 'Marketplace Plan Applied',
        description: `Applied ${foundPlan.planName} (${foundPlan.id}). Remember to click Save Changes to persist your policy.`,
        type: 'success'
      });
    }
  };

  const activePlanToDisplay = appliedPlan || foundPlan;

  return (
    <div className="bg-white border border-[#DCE2EA] rounded-md p-5 shadow-2xs space-y-5 text-xs text-[#172033] font-sans h-full flex flex-col justify-between">
      
      <div>
        {/* Header */}
        <div className="border-b border-[#E8ECF2] pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#172033]">Marketplace Plan Lookup</h3>
            <p className="text-[11px] text-[#556176] mt-0.5">
              Verify official Healthcare.gov carrier benefits, deductibles, and tax credit estimates.
            </p>
          </div>
          {activePlanToDisplay && (
            <span className="crm-badge crm-badge-info text-[10px]">
              {appliedPlan ? 'Plan Applied' : 'Preview Ready'}
            </span>
          )}
        </div>

        {/* Input Fields */}
        <div className="space-y-3.5 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#172033] mb-1">
                Plan ID *
              </label>
              <input
                type="text"
                value={planIdInput}
                onChange={(e) => setPlanIdInput(e.target.value)}
                placeholder="e.g. 21525FL0020016"
                disabled={loading}
                className="crm-input w-full font-mono text-xs uppercase"
              />
            </div>

            <div>
              <label className="block font-medium text-[#172033] mb-1">
                Coverage Year *
              </label>
              <select
                value={yearInput}
                onChange={(e) => setYearInput(e.target.value)}
                disabled={loading}
                className="crm-input w-full"
              >
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-[#172033] mb-1">
                ZIP Code *
              </label>
              <input
                type="text"
                value={zipInput}
                onChange={(e) => setZipInput(e.target.value)}
                placeholder="e.g. 33131"
                disabled={loading}
                className="crm-input w-full"
              />
            </div>

            <div>
              <label className="block font-medium text-[#172033] mb-1">
                County
              </label>
              <input
                type="text"
                value={countyInput}
                onChange={(e) => setCountyInput(e.target.value)}
                placeholder="e.g. Miami-Dade"
                disabled={loading}
                className="crm-input w-full"
              />
            </div>

            <div>
              <label className="block font-medium text-[#172033] mb-1">
                State
              </label>
              <input
                type="text"
                value={stateInput}
                onChange={(e) => setStateInput(e.target.value.toUpperCase())}
                placeholder="FL"
                maxLength={2}
                disabled={loading}
                className="crm-input w-full uppercase"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleClear}
              disabled={loading}
              className="crm-btn-secondary text-xs px-3 py-1.5"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleSearch()}
              disabled={loading}
              className="crm-btn-primary text-xs px-4 py-1.5"
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Searching...
                </span>
              ) : (
                'Search Marketplace'
              )}
            </button>
          </div>
        </div>

        {/* Error State */}
        {errorMsg && (
          <div className="mt-4 p-3 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-[#C24141] text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {/* PLAN FOUND PREVIEW (When search returns a match but not yet applied) */}
        {foundPlan && !appliedPlan && (
          <div className="mt-5 border border-[#BFDBFE] bg-[#EEF4FF] rounded-md p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-[#BFDBFE] pb-2">
              <h4 className="font-semibold text-[#2563EB] text-xs uppercase tracking-wide">
                Plan Found in Marketplace
              </h4>
              <span className="text-[11px] font-mono bg-white text-[#2563EB] px-2 py-0.5 rounded border border-[#BFDBFE]">
                {foundPlan.id}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-[#556176] block text-[11px]">Carrier</span>
                <span className="font-semibold text-[#172033]">{foundPlan.issuerName}</span>
              </div>
              <div>
                <span className="text-[#556176] block text-[11px]">Plan Name</span>
                <span className="font-semibold text-[#172033]">{foundPlan.planName}</span>
              </div>
              <div>
                <span className="text-[#556176] block text-[11px]">Metal Level</span>
                <span className="font-semibold text-[#172033]">{foundPlan.metalLevel}</span>
              </div>
              <div>
                <span className="text-[#556176] block text-[11px]">Plan Type / Network</span>
                <span className="font-semibold text-[#172033]">{foundPlan.planType}</span>
              </div>
              <div>
                <span className="text-[#556176] block text-[11px]">Full Monthly Premium</span>
                <span className="font-semibold text-[#172033]">{formatCurrency(foundPlan.premiumFull)}</span>
              </div>
              <div>
                <span className="text-[#556176] block text-[11px]">Estimated Tax Credit</span>
                <span className="font-semibold text-[#15803D]">{formatCurrency(foundPlan.taxCredit)}</span>
              </div>
              <div>
                <span className="text-[#556176] block text-[11px]">Final Monthly Premium</span>
                <span className="font-bold text-[#2563EB]">{formatCurrency(foundPlan.premiumNet)}</span>
              </div>
              <div>
                <span className="text-[#556176] block text-[11px]">Final Annual Premium</span>
                <span className="font-semibold text-[#172033]">{formatCurrency(foundPlan.premiumAnnual)}</span>
              </div>
              <div>
                <span className="text-[#556176] block text-[11px]">Individual Deductible</span>
                <span className="font-semibold text-[#172033]">{foundPlan.deductibleIndividual !== null ? formatCurrency(foundPlan.deductibleIndividual) : 'N/A'}</span>
              </div>
              <div>
                <span className="text-[#556176] block text-[11px]">Family Deductible</span>
                <span className="font-semibold text-[#172033]">{foundPlan.deductibleFamily !== null ? formatCurrency(foundPlan.deductibleFamily) : 'N/A'}</span>
              </div>
              <div>
                <span className="text-[#556176] block text-[11px]">Individual OOP Max</span>
                <span className="font-semibold text-[#172033]">{foundPlan.oopMaxIndividual !== null ? formatCurrency(foundPlan.oopMaxIndividual) : 'N/A'}</span>
              </div>
              <div>
                <span className="text-[#556176] block text-[11px]">Family OOP Max</span>
                <span className="font-semibold text-[#172033]">{foundPlan.oopMaxFamily !== null ? formatCurrency(foundPlan.oopMaxFamily) : 'N/A'}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#BFDBFE]">
              <button
                type="button"
                onClick={handleCancelPreview}
                className="crm-btn-secondary text-xs px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                className="crm-btn-primary text-xs px-4 py-1.5"
              >
                Apply This Plan
              </button>
            </div>
          </div>
        )}

        {/* APPROVED PLAN BENEFITS VERTICAL CASCADE (Rendered after Apply This Plan) */}
        {activePlanToDisplay && (
          <div className="mt-5 space-y-4 pt-3 border-t border-[#E8ECF2]">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#172033] uppercase tracking-wide">
                Approved Plan Benefits
              </h4>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#556176]">11 Standard Benefit Categories</span>
                <button
                  type="button"
                  onClick={() => setIsBenefitsCollapsed(!isBenefitsCollapsed)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 px-2 py-0.5 rounded border border-blue-100"
                >
                  {isBenefitsCollapsed ? 'Show' : 'Hide'}
                </button>
              </div>
            </div>

            {!isBenefitsCollapsed && (
              <div className="space-y-4">
                {/* Section 1: Monthly Cost */}
                <BenefitSectionCard title="1. Monthly Cost">
                  <BenefitRow label="Full Monthly Premium" value={formatCurrency(activePlanToDisplay.premiumFull)} />
                  <BenefitRow label="Tax Credit (APTC)" value={formatCurrency(activePlanToDisplay.taxCredit)} highlightColor="text-[#15803D]" />
                  <BenefitRow label="Final Monthly Premium" value={formatCurrency(activePlanToDisplay.premiumNet)} highlightColor="text-[#2563EB] font-bold" />
                  <BenefitRow label="Final Annual Premium" value={formatCurrency(activePlanToDisplay.premiumAnnual)} />
                </BenefitSectionCard>

                {/* Section 2: Deductibles */}
                <BenefitSectionCard title="2. Deductibles">
                  <BenefitRow label="Individual Medical Deductible" value={activePlanToDisplay.deductibleIndividual !== null ? formatCurrency(activePlanToDisplay.deductibleIndividual) : 'Not applicable / $0'} />
                  <BenefitRow label="Family Medical Deductible" value={activePlanToDisplay.deductibleFamily !== null ? formatCurrency(activePlanToDisplay.deductibleFamily) : 'Not applicable / $0'} />
                  <BenefitRow label="Individual Prescription Drug Deductible" value={activePlanToDisplay.drugDeductibleIndividual !== null ? formatCurrency(activePlanToDisplay.drugDeductibleIndividual) : 'Included in medical deductible'} />
                  <BenefitRow label="Family Prescription Drug Deductible" value={activePlanToDisplay.drugDeductibleFamily !== null ? formatCurrency(activePlanToDisplay.drugDeductibleFamily) : 'Included in medical deductible'} />
                </BenefitSectionCard>

                {/* Section 3: Out-of-Pocket Maximum */}
                <BenefitSectionCard title="3. Out-of-Pocket Maximum">
                  <BenefitRow label="Individual Maximum" value={activePlanToDisplay.oopMaxIndividual !== null ? formatCurrency(activePlanToDisplay.oopMaxIndividual) : 'Not provided'} />
                  <BenefitRow label="Family Maximum" value={activePlanToDisplay.oopMaxFamily !== null ? formatCurrency(activePlanToDisplay.oopMaxFamily) : 'Not provided'} />
                </BenefitSectionCard>

                {/* Section 4: Doctor Visits */}
                <BenefitSectionCard title="4. Doctor Visits">
                  {renderCategoryBenefits(activePlanToDisplay.benefits, 'Doctor Visits')}
                </BenefitSectionCard>

                {/* Section 5: Tests and Diagnostic Services */}
                <BenefitSectionCard title="5. Tests and Diagnostic Services">
                  {renderCategoryBenefits(activePlanToDisplay.benefits, 'Tests and Diagnostic Services')}
                </BenefitSectionCard>

                {/* Section 6: Urgent and Emergency Care */}
                <BenefitSectionCard title="6. Urgent and Emergency Care">
                  {renderCategoryBenefits(activePlanToDisplay.benefits, 'Urgent and Emergency Care')}
                </BenefitSectionCard>

                {/* Section 7: Hospital and Surgery */}
                <BenefitSectionCard title="7. Hospital and Surgery">
                  {renderCategoryBenefits(activePlanToDisplay.benefits, 'Hospital and Surgery')}
                </BenefitSectionCard>

                {/* Section 8: Prescription Drugs */}
                <BenefitSectionCard title="8. Prescription Drugs">
                  {renderCategoryBenefits(activePlanToDisplay.benefits, 'Prescription Drugs')}
                </BenefitSectionCard>

                {/* Section 9: Additional Important Medical Benefits */}
                <BenefitSectionCard title="9. Additional Important Medical Benefits">
                  {renderCategoryBenefits(activePlanToDisplay.benefits, 'Additional Important Medical Benefits')}
                </BenefitSectionCard>

                {/* Section 10: Dental and Vision */}
                <BenefitSectionCard title="10. Dental and Vision">
                  {renderCategoryBenefits(activePlanToDisplay.benefits, 'Dental and Vision')}
                </BenefitSectionCard>

                {/* Section 11: Plan Documents */}
                <BenefitSectionCard title="11. Plan Documents & Links">
                  <DocumentLinkRow label="Summary of Benefits and Coverage (SBC)" url={activePlanToDisplay.benefitsUrl} />
                  <DocumentLinkRow label="Plan Brochure" url={activePlanToDisplay.brochureUrl} />
                  <DocumentLinkRow label="Drug Formulary" url={activePlanToDisplay.formularyUrl} />
                  <DocumentLinkRow label="Provider Directory" url={activePlanToDisplay.networkUrl} />
                  <BenefitRow label="Source" value="Healthcare.gov Official API" />
                  <BenefitRow label="Last Marketplace Sync" value={new Date().toLocaleDateString('en-US')} />
                </BenefitSectionCard>

                {/* Additional Plan Details (HSA Eligibility) */}
                {activePlanToDisplay.hsaEligible !== undefined && (
                  <BenefitSectionCard title="Additional Plan Details">
                    <BenefitRow label="HSA Eligible Plan" value={activePlanToDisplay.hsaEligible ? 'Yes' : 'No'} />
                  </BenefitSectionCard>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CONFIRMATION MODAL BEFORE APPLYING PLAN */}
      {showConfirmModal && foundPlan && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DCE2EA] rounded-lg max-w-md w-full p-5 shadow-lg space-y-4">
            <h3 className="text-sm font-semibold text-[#172033]">
              Confirm Applying Marketplace Plan
            </h3>
            <p className="text-xs text-[#556176]">
              Applying this plan will update compatible fields in your Health Information form.
            </p>

            <div className="bg-[#F8FAFC] border border-[#E8ECF2] rounded-md p-3 text-xs space-y-1.5">
              <span className="font-semibold text-[#172033] block mb-1">Fields that will update:</span>
              <div className="grid grid-cols-2 gap-1 text-[11px] text-[#556176]">
                <div>• Company: <strong>{foundPlan.issuerName}</strong></div>
                <div>• Type Plan: <strong>{foundPlan.metalLevel}</strong></div>
                <div>• Plan ID: <strong>{foundPlan.id}</strong></div>
                <div>• Plan Name: <strong>{foundPlan.planName}</strong></div>
                <div>• Plan Cost: <strong>{formatCurrency(foundPlan.premiumFull)}</strong></div>
                <div>• Tax Credit: <strong>{formatCurrency(foundPlan.taxCredit)}</strong></div>
                <div>• Net Premium: <strong>{formatCurrency(foundPlan.premiumNet)}</strong></div>
                <div>• Coverage Year: <strong>{foundPlan.coverageYear}</strong></div>
              </div>
            </div>

            <p className="text-[11px] text-[#7C8799] italic">
              Note: This action updates your local form. You must click "Save Changes" at the bottom of the Health module to persist your policy.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E8ECF2]">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="crm-btn-secondary text-xs px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApply}
                className="crm-btn-primary text-xs px-4 py-1.5"
              >
                Confirm & Apply
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function BenefitSectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[#E8ECF2] rounded-md bg-[#F8FAFC] p-3 space-y-2">
      <h5 className="text-[11px] font-semibold text-[#172033] uppercase tracking-wide border-b border-[#E8ECF2] pb-1.5">
        {title}
      </h5>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function BenefitRow({ label, value, highlightColor }: { label: string; value: string; highlightColor?: string }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-[#556176]">{label}</span>
      <span className={`font-medium ${highlightColor || 'text-[#172033]'}`}>{value}</span>
    </div>
  );
}

function DocumentLinkRow({ label, url }: { label: string; url?: string }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-[#556176]">{label}</span>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#2563EB] hover:underline font-medium">
          View Document →
        </a>
      ) : (
        <span className="text-[#7C8799] italic">Not provided</span>
      )}
    </div>
  );
}

function renderCategoryBenefits(benefits: NormalizedBenefit[], categoryName: string) {
  const catBenefits = benefits.filter((b) => b.category === categoryName);
  if (catBenefits.length === 0) {
    return <div className="text-[11px] text-[#7C8799] italic">No benefits provided for this category</div>;
  }
  return catBenefits.map((b, i) => (
    <div key={i} className="flex flex-col py-1 border-b border-[#E8ECF2] last:border-0 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-[#172033]">{b.serviceName}</span>
        <span className={`font-semibold ${b.coverageStatus === 'Not covered' ? 'text-[#C24141]' : 'text-[#172033]'}`}>
          {b.individualValue}
        </span>
      </div>
      {b.limitations && (
        <span className="text-[10px] text-[#7C8799] mt-0.5">{b.limitations}</span>
      )}
    </div>
  ));
}
