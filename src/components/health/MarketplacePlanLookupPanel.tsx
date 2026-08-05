import React, { useState, useEffect } from 'react';
import { MarketplacePlanPreview, MarketplaceClientContext } from '@/lib/marketplace/types';
import { buildMarketplaceFingerprint } from '@/lib/marketplace/people-helper';
import { formatCurrency } from '@/lib/marketplace/normalizer';

interface MarketplacePlanLookupPanelProps {
  initialPlanId?: string;
  context: MarketplaceClientContext;
  isEditing: boolean;
  onApplyPlan: (plan: MarketplacePlanPreview) => Promise<{ success: boolean; error?: string }> | void;
  appliedPlan: MarketplacePlanPreview | null;
  addToast: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
}

export default function MarketplacePlanLookupPanel({
  initialPlanId = '',
  context,
  isEditing,
  onApplyPlan,
  appliedPlan,
  addToast
}: MarketplacePlanLookupPanelProps) {
  const [planIdInput, setPlanIdInput] = useState(initialPlanId);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [foundPlan, setFoundPlan] = useState<MarketplacePlanPreview | null>(null);
  const [relatedVariants, setRelatedVariants] = useState<Array<{ id: string; name: string; issuerName: string; metalLevel: string }>>([]);
  const [resolvedSearchArea, setResolvedSearchArea] = useState<{ countyName?: string; countyFips?: string; state?: string; zipCode?: string } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isBenefitsCollapsed, setIsBenefitsCollapsed] = useState(true);
  const [lastFingerprint, setLastFingerprint] = useState<string | null>(null);

  // Sync initial plan ID if passed
  useEffect(() => {
    if (initialPlanId && !planIdInput) setPlanIdInput(initialPlanId);
  }, [initialPlanId]);

  // Stale data prevention: clear search results when Plan ID or Context changes
  useEffect(() => {
    const currentFingerprint = buildMarketplaceFingerprint({
      planId: planIdInput,
      coverageYear: context.coverageYear,
      zipCode: context.zipCode,
      state: context.state,
      countyFips: context.countyFips,
      householdIncome: context.householdIncome,
      householdSize: context.householdSize,
      people: context.people
    });

    if (lastFingerprint && currentFingerprint !== lastFingerprint) {
      setFoundPlan(null);
      setErrorMsg(null);
      setRelatedVariants([]);
      setLastFingerprint(null);
    }
  }, [planIdInput, context, lastFingerprint]);

  const handleSearch = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setErrorMsg(null);
    setFoundPlan(null);
    setRelatedVariants([]);

    const cleanPlanId = planIdInput.trim().toUpperCase();

    if (!cleanPlanId) {
      setErrorMsg('Please enter a Plan ID to search (e.g. 30252FL0070065).');
      return;
    }

    // Missing-data validation before calling API
    if (context.validationErrors && context.validationErrors.length > 0) {
      setErrorMsg(context.validationErrors.join(' • '));
      return;
    }

    const currentFingerprint = buildMarketplaceFingerprint({
      planId: cleanPlanId,
      coverageYear: context.coverageYear,
      zipCode: context.zipCode,
      state: context.state,
      countyFips: context.countyFips,
      householdIncome: context.householdIncome,
      householdSize: context.householdSize,
      people: context.people
    });

    setLoading(true);
    try {
      const res = await fetch('/api/marketplace/plan-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: cleanPlanId,
          coverageYear: context.coverageYear,
          zipCode: context.zipCode,
          countyFips: context.countyFips,
          state: context.state,
          householdIncome: context.householdIncome,
          people: context.people.map(p => ({
            age: p.age,
            gender: p.gender || 'Male',
            uses_tobacco: !!p.uses_tobacco,
            relationship: p.relationship,
            applying_for_coverage: p.applying_for_coverage
          }))
        })
      });

      const data = await res.json();

      if (data.searchArea) {
        setResolvedSearchArea(data.searchArea);
      }

      // Development Audit Log
      const auditObject = {
        enteredPlanId: cleanPlanId,
        year: context.coverageYear,
        zip: context.zipCode,
        state: context.state,
        countyName: data?.searchArea?.countyName || context.countyName || 'Broward County',
        countyFips: data?.searchArea?.countyFips || context.countyFips || '12011',
        householdIncome: context.householdIncome,
        householdSize: context.householdSize,
        coveredCount: context.coveredApplicants,
        people: context.people.map(p => ({
          age: p.age,
          relationship: p.relationship,
          coverage: p.applying_for_coverage,
          genderPresent: !!p.gender,
          tobaccoPresent: p.uses_tobacco !== undefined
        }))
      };
      if (process.env.NODE_ENV !== 'production') {
        console.log('[MARKETPLACE_BROWSER_REQUEST_AUDIT]', auditObject);
      }

      if (!res.ok || !data.found) {
        setErrorMsg(data.message || 'Plan not found for this year and service area.');
        if (data.relatedVariants) {
          setRelatedVariants(data.relatedVariants);
        }
      } else {
        setFoundPlan(data.plan);
        setRelatedVariants([]);
        setLastFingerprint(currentFingerprint);
      }
    } catch (err: any) {
      console.error('Marketplace search request failed:', err);
      setErrorMsg(err?.message || 'Failed to connect to Marketplace API service.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setPlanIdInput('');
    setErrorMsg(null);
    setFoundPlan(null);
    setRelatedVariants([]);
    setLastFingerprint(null);
  };

  const handleCancelPreview = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setFoundPlan(null);
    setErrorMsg(null);
  };

  const handleConfirmApply = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!foundPlan) return;

    setApplying(true);
    setApplyError(null);
    try {
      const res = await onApplyPlan(foundPlan);
      if (res && res.success === false) {
        setApplyError(res.error || 'Unable to save applied plan. Please try again.');
        return;
      }
      setShowConfirmModal(false);
      setIsBenefitsCollapsed(false);
    } catch (err: any) {
      console.error('Apply plan error:', err);
      setApplyError(err?.message || 'Unable to save applied plan. Please try again.');
    } finally {
      setApplying(false);
    }
  };

  const activePlanToDisplay = foundPlan || appliedPlan;
  const isAppliedView = !foundPlan && !!appliedPlan;

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* SEARCH CARD */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-4">
        {/* Header */}
        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
              Marketplace Plan Lookup
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Automated carrier lookup using current client & health policy data.
            </p>
          </div>
          {activePlanToDisplay && (
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              foundPlan ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            }`}>
              {foundPlan ? 'Preview Ready' : 'Plan Applied'}
            </span>
          )}
        </div>

        {/* COMPACT READ-ONLY CLIENT DATA SUMMARY */}
        <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between font-bold text-slate-700 text-[10px] uppercase tracking-wider border-b border-slate-200/60 pb-1.5">
            <span>Using Client Data</span>
            <span className="text-[10px] text-blue-700 font-semibold lowercase bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
              {context.householdSize} member{context.householdSize > 1 ? 's' : ''} ({context.coveredApplicants} covered)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600 font-medium">
            <div>
              <span className="block text-[10px] text-slate-400 uppercase">Coverage Year</span>
              <span className="text-slate-900 font-bold">{context.coverageYear || '—'}</span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400 uppercase">ZIP / State</span>
              <span className="text-slate-900 font-bold">{context.zipCode ? `${context.zipCode}, ${context.state || ''}` : '—'}</span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400 uppercase">County</span>
              <span className="text-slate-900 font-bold font-sans">
                {resolvedSearchArea?.countyName || context.countyName || (context.countyFips ? `FIPS ${context.countyFips}` : 'Resolving...')}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400 uppercase">Household Income</span>
              <span className="text-slate-900 font-bold">
                {context.householdIncome !== null && context.householdIncome !== undefined && context.householdIncome > 0
                  ? `$${Number(context.householdIncome).toLocaleString()}`
                  : 'Not specified'}
              </span>
            </div>
          </div>

          {/* COMPACT PEOPLE SUMMARY LIST */}
          <div className="space-y-1 pt-1.5 border-t border-slate-200/60">
            <span className="block text-[10px] font-bold text-slate-400 uppercase">Tax Household Members</span>
            <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
              {context.people.map(p => (
                <div key={p.member_number} className="flex items-center justify-between bg-white px-2.5 py-1 rounded border border-slate-100 text-[11px]">
                  <span className="font-semibold text-slate-800">
                    {p.member_number === 1 ? 'Applicant' : `Member ${p.member_number}`} — <span className="text-slate-600">{p.relationship}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-medium">Age {p.age}</span>
                    <span className={`px-1.5 py-0.2 text-[10px] font-bold rounded ${p.applying_for_coverage ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      Coverage {p.applying_for_coverage ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* INPUT CONTROLS: ONLY PLAN ID (NOT A NESTED FORM TO PREVENT OUTER FORM SUBMISSION) */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Plan ID *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={planIdInput}
                onChange={e => setPlanIdInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSearch(e);
                  }
                }}
                placeholder="e.g. 30252FL0070065"
                disabled={loading}
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-slate-900 font-mono text-xs font-semibold uppercase outline-none transition-all"
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={loading}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all whitespace-nowrap flex items-center gap-1.5"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Searching...
                  </>
                ) : (
                  'Search Marketplace'
                )}
              </button>
              {planIdInput && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={loading}
                  className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ERROR DISPLAY */}
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-100 text-rose-800 p-3 rounded-xl text-xs font-medium space-y-1">
            <h5 className="font-extrabold text-[10px] uppercase tracking-wider text-rose-900">Validation / Search Warning</h5>
            <p>{errorMsg}</p>
          </div>
        )}

        {/* RELATED VARIANTS SUGGESTION SECTION */}
        {relatedVariants.length > 0 && (
          <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 space-y-3 font-sans text-xs">
            <div className="flex items-center justify-between">
              <h5 className="font-extrabold text-amber-900 uppercase tracking-wider text-[11px]">
                Related Marketplace Variants Available ({relatedVariants.length})
              </h5>
            </div>
            <p className="text-amber-800 text-[11px] leading-relaxed">
              Exact plan variant not found. Related Marketplace variants are available in this service area. Click any variant below to select and preview:
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {relatedVariants.map(v => (
                <div key={v.id} className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-amber-200/60 shadow-2xs">
                  <div>
                    <span className="font-mono font-bold text-slate-900 text-xs block">{v.id}</span>
                    <span className="font-semibold text-slate-800 text-xs block">{v.name}</span>
                    <span className="text-[10px] text-slate-500 font-medium">{v.issuerName} • {v.metalLevel}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPlanIdInput(v.id);
                      // Trigger search immediately with selected variant
                      setTimeout(() => {
                        const evt = { preventDefault: () => {}, stopPropagation: () => {} } as any;
                        fetch('/api/marketplace/plan-lookup', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            planId: v.id,
                            coverageYear: context.coverageYear,
                            zipCode: context.zipCode,
                            countyFips: context.countyFips,
                            state: context.state,
                            householdIncome: context.householdIncome,
                            people: context.people.map(p => ({
                              age: p.age,
                              gender: p.gender || 'Male',
                              uses_tobacco: !!p.uses_tobacco,
                              relationship: p.relationship,
                              applying_for_coverage: p.applying_for_coverage
                            }))
                          })
                        })
                        .then(r => r.json())
                        .then(data => {
                          if (data.found && data.plan) {
                            setFoundPlan(data.plan);
                            setErrorMsg(null);
                            setRelatedVariants([]);
                          }
                        })
                        .catch(err => console.error(err));
                      }, 0);
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-all whitespace-nowrap"
                  >
                    Select & Search
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SEARCH RESULTS PREVIEW CARD */}
      {activePlanToDisplay && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider">
                {isAppliedView ? 'Applied Policy Plan' : 'Marketplace Search Preview'}
              </span>
              <h4 className="text-base font-extrabold text-slate-900 mt-0.5">
                {activePlanToDisplay.planName}
              </h4>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                {activePlanToDisplay.issuerName} • <span className="font-mono">{activePlanToDisplay.id}</span>
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Metal Level</span>
              <span className="text-xs font-extrabold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                {activePlanToDisplay.metalLevel}
              </span>
            </div>
          </div>

          {/* FINANCIAL ESTIMATES & DEDUCTIBLES GRID */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/60 text-xs">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase">Plan Cost (Full)</span>
              <span className="text-slate-900 font-extrabold text-sm">{formatCurrency(activePlanToDisplay.premiumFull)}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase">Tax Credit (APTC)</span>
              <span className="text-emerald-700 font-extrabold text-sm">
                {activePlanToDisplay.taxCredit !== null && activePlanToDisplay.taxCredit !== undefined && activePlanToDisplay.taxCredit > 0
                  ? formatCurrency(activePlanToDisplay.taxCredit)
                  : 'Not calculated'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase">Final Monthly</span>
              <span className="text-blue-700 font-extrabold text-sm">
                {activePlanToDisplay.taxCredit !== null && activePlanToDisplay.taxCredit !== undefined
                  ? formatCurrency(activePlanToDisplay.premiumNet)
                  : 'Not calculated'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase">
                {activePlanToDisplay.isCombinedDeductible ? 'Deductible (Ind / Fam)' : 'Deductible (Ind / Fam)'}
              </span>
              <span className="text-slate-800 font-extrabold text-sm block">
                {activePlanToDisplay.deductibleIndividual !== null ? formatCurrency(activePlanToDisplay.deductibleIndividual) : '—'} / {activePlanToDisplay.deductibleFamily !== null ? formatCurrency(activePlanToDisplay.deductibleFamily) : '—'}
              </span>
              {activePlanToDisplay.isCombinedDeductible && (
                <span className="text-[9px] text-slate-500 font-medium">Combined Health & Drug</span>
              )}
            </div>
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase">OOP Max (Ind / Fam)</span>
              <span className="text-slate-800 font-extrabold text-sm block">
                {activePlanToDisplay.oopMaxIndividual !== null ? formatCurrency(activePlanToDisplay.oopMaxIndividual) : '—'} / {activePlanToDisplay.oopMaxFamily !== null ? formatCurrency(activePlanToDisplay.oopMaxFamily) : '—'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase">Plan Type</span>
              <span className="text-slate-800 font-extrabold text-sm uppercase">{activePlanToDisplay.planType || 'HMO'}</span>
            </div>
          </div>

          {/* PLAN DOCUMENTS LINKS */}
          {(activePlanToDisplay.benefitsUrl || activePlanToDisplay.brochureUrl || activePlanToDisplay.formularyUrl || activePlanToDisplay.networkUrl) && (
            <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="text-[10px] font-bold text-slate-400 uppercase block w-full mb-0.5">Official Documents</span>
              {activePlanToDisplay.benefitsUrl ? (
                <a href={activePlanToDisplay.benefitsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
                  Summary of Benefits (SBC) ↗
                </a>
              ) : null}
              {activePlanToDisplay.brochureUrl ? (
                <a href={activePlanToDisplay.brochureUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
                  Plan Brochure ↗
                </a>
              ) : null}
              {activePlanToDisplay.formularyUrl ? (
                <a href={activePlanToDisplay.formularyUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
                  Drug Formulary ↗
                </a>
              ) : null}
              {activePlanToDisplay.networkUrl ? (
                <a href={activePlanToDisplay.networkUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
                  Provider Directory ↗
                </a>
              ) : null}
            </div>
          )}

          {/* ACTIONS: APPLY THIS PLAN */}
          {foundPlan && (
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleCancelPreview}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
              >
                Cancel Preview
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowConfirmModal(true);
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition-all flex items-center gap-1.5"
              >
                Apply This Plan
              </button>
            </div>
          )}

          {/* BENEFIT SHOW / HIDE COLLAPSIBLE */}
          {activePlanToDisplay.benefits && activePlanToDisplay.benefits.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  Plan Benefits & Services ({activePlanToDisplay.benefits.length})
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsBenefitsCollapsed(prev => !prev);
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  {isBenefitsCollapsed ? 'Show Benefits ↓' : 'Hide Benefits ↑'}
                </button>
              </div>

              {!isBenefitsCollapsed && (
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                  {activePlanToDisplay.benefits.map((b, idx) => (
                    <div
                      key={idx}
                      className={`p-3 transition-colors flex items-start justify-between gap-4 text-xs ${
                        b.isUnmapped ? 'bg-slate-50/90 hover:bg-slate-100/90' : 'bg-white hover:bg-slate-50/80'
                      }`}
                    >
                      <div>
                        <span className={`text-[10px] font-bold uppercase block ${b.isUnmapped ? 'text-amber-700' : 'text-slate-400'}`}>
                          {b.category}
                        </span>
                        <span className="font-extrabold text-slate-800 block mt-0.5">{b.serviceName}</span>
                        {b.secondaryDisplay && (
                          <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                            {b.secondaryDisplay}
                          </span>
                        )}
                        {b.limitations && (
                          <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{b.limitations}</p>
                        )}
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <span className={`font-extrabold block ${
                          b.coverageStatus === 'Not covered'
                            ? 'text-rose-600'
                            : b.coverageStatus === 'Not provided by Marketplace API' || b.coverageStatus === 'Cost sharing not specified'
                            ? 'text-slate-400 font-normal italic'
                            : 'text-slate-900'
                        }`}>
                          {b.individualValue}
                        </span>
                        {b.deductibleApplies && b.coverageStatus === 'Covered' && (
                          <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded mt-1 inline-block">
                            Deductible applies
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CONFIRM APPLY MODAL */}
      {showConfirmModal && foundPlan && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 font-sans" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-extrabold text-slate-800">
              Confirm Apply Marketplace Plan
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to apply <strong className="text-slate-900">{foundPlan.planName}</strong> (<span className="font-mono font-bold text-slate-800">{foundPlan.id}</span>) to this Health Policy?
            </p>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1 text-xs font-semibold text-slate-700">
              <div>Plan Cost: <strong className="text-slate-900">{formatCurrency(foundPlan.premiumFull)}</strong></div>
              <div>Tax Credit: <strong className="text-emerald-700">{foundPlan.taxCredit ? formatCurrency(foundPlan.taxCredit) : 'Not calculated'}</strong></div>
              <div>Monthly Premium: <strong className="text-blue-700">{formatCurrency(foundPlan.premiumNet)}</strong></div>
            </div>
            {applyError && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs font-semibold">
                {applyError}
              </div>
            )}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowConfirmModal(false);
                  setApplyError(null);
                }}
                disabled={applying}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApply}
                disabled={applying}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {applying ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Confirm & Apply'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
