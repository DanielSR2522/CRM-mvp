'use client';

import React, { useState, useMemo } from 'react';
import { MarketplacePlanPreview, MarketplaceClientContext, NormalizedBenefit } from '@/lib/marketplace/types';
import { formatCurrency } from '@/lib/marketplace/normalizer';
import { unlinkMarketplacePlan } from '@/lib/marketplace/snapshot-service';

interface MarketplaceSearchWorkspaceProps {
  healthPolicyId?: string;
  context: MarketplaceClientContext;
  onApplyPlan: (plan: MarketplacePlanPreview) => Promise<{ success: boolean; error?: string }> | void;
  onUnlinkPlan?: () => Promise<{ success: boolean; error?: string }> | void;
  appliedPlan: MarketplacePlanPreview | null;
  addToast: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
  onReturnToSummary?: () => void;
}

export default function MarketplaceSearchWorkspace({
  healthPolicyId,
  context,
  onApplyPlan,
  onUnlinkPlan,
  appliedPlan,
  addToast,
  onReturnToSummary,
}: MarketplaceSearchWorkspaceProps) {
  const [planIdInput, setPlanIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [showUnlinkModal, setShowUnlinkModal] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [foundPlan, setFoundPlan] = useState<MarketplacePlanPreview | null>(null);
  const [benefitSearchQuery, setBenefitSearchQuery] = useState('');
  const [isBenefitsExpanded, setIsBenefitsExpanded] = useState(true);

  // Search Marketplace API by Plan ID
  const handleSearch = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setErrorMsg(null);
    setFoundPlan(null);
    setBenefitSearchQuery('');

    const cleanPlanId = planIdInput.trim().toUpperCase();

    if (!cleanPlanId) {
      setErrorMsg('Please enter a valid Plan ID to search (e.g. 30252FL0070065).');
      return;
    }

    if (context.validationErrors && context.validationErrors.length > 0) {
      setErrorMsg(context.validationErrors.join(' • '));
      return;
    }

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
          people: context.people.map((p) => ({
            age: p.age,
            gender: p.gender || 'Male',
            uses_tobacco: !!p.uses_tobacco,
            relationship: p.relationship,
            applying_for_coverage: p.applying_for_coverage,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.found) {
        setErrorMsg(data.message || 'Plan ID not found for the specified service area and year.');
      } else {
        setFoundPlan(data.plan);
      }
    } catch (err: any) {
      console.error('Marketplace search error:', err);
      setErrorMsg(err?.message || 'Network error searching Marketplace.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setPlanIdInput('');
    setFoundPlan(null);
    setErrorMsg(null);
    setBenefitSearchQuery('');
  };

  const handleCancelPreview = () => {
    setFoundPlan(null);
    setErrorMsg(null);
    setBenefitSearchQuery('');
  };

  const handleApplyThisPlan = async () => {
    if (!foundPlan) return;
    setApplying(true);
    setApplyError(null);
    try {
      const res = await onApplyPlan(foundPlan);
      if (res && res.success === false) {
        setApplyError(res.error || 'Failed to apply plan.');
        return;
      }
      addToast({
        title: 'Plan Applied Successfully',
        description: `${foundPlan.planName} is now saved to this client health policy.`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('Error applying plan:', err);
      setApplyError(err?.message || 'Error applying plan.');
    } finally {
      setApplying(false);
    }
  };

  const handleConfirmUnlink = async () => {
    setShowUnlinkModal(false);
    setUnlinking(true);
    try {
      if (onUnlinkPlan) {
        await onUnlinkPlan();
      } else if (healthPolicyId) {
        await unlinkMarketplacePlan(healthPolicyId);
      }
      setFoundPlan(null);
      addToast({
        title: 'Marketplace Plan Unlinked',
        description: 'The Marketplace plan association has been removed from this health profile.',
        type: 'success',
      });
    } catch (err: any) {
      console.error('Error unlinking plan:', err);
      addToast({
        title: 'Unlink Failed',
        description: err?.message || 'Could not unlink Marketplace plan.',
        type: 'error',
      });
    } finally {
      setUnlinking(false);
    }
  };

  const activePlan = foundPlan || appliedPlan;
  const isAppliedView = !foundPlan && !!appliedPlan;

  // Local Benefit Search & Categorization
  const filteredBenefits = useMemo(() => {
    if (!activePlan || !activePlan.benefits) return [];
    const q = benefitSearchQuery.trim().toLowerCase();
    if (!q) return activePlan.benefits;

    return activePlan.benefits.filter((b) => {
      const searchHaystack = [
        b.serviceName,
        b.category,
        b.coverageStatus,
        b.individualValue,
        b.familyValue,
        b.limitations,
        b.notes,
        b.sourceText,
        b.networkTier,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchHaystack.includes(q);
    });
  }, [activePlan, benefitSearchQuery]);

  // Group Filtered Benefits by Category
  const groupedBenefits = useMemo(() => {
    const map = new Map<string, NormalizedBenefit[]>();
    filteredBenefits.forEach((b) => {
      const cat = b.category || 'General Benefits';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(b);
    });
    return Array.from(map.entries());
  }, [filteredBenefits]);

  return (
    <div className="space-y-6 font-sans text-xs w-full max-w-none">
      {/* UNLINK CONFIRMATION MODAL */}
      {showUnlinkModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4 font-sans animate-scale-up">
            <h4 className="text-base font-extrabold text-slate-900">Unlink this Marketplace plan?</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              This removes the Marketplace plan association from this Health profile. The Health policy, client, notes, documents, and medical records will remain.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowUnlinkModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnlink}
                disabled={unlinking}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-all flex items-center gap-1.5"
              >
                {unlinking ? 'Unlinking Plan...' : 'Unlink Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. TOP HEADER & CLIENT CONTEXT BANNER */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>🔍</span> Marketplace Search & Plan Explorer
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Search ACA Marketplace plans by Plan ID and explore benefits for this client.
            </p>
          </div>
          {onReturnToSummary && (
            <button
              type="button"
              onClick={onReturnToSummary}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all self-start sm:self-auto flex items-center gap-1.5"
            >
              ← Back to Summary
            </button>
          )}
        </div>

        {/* Client Context Details Grid */}
        <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-700 font-medium">
          <div>
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Coverage Year</span>
            <span className="text-xs font-bold text-slate-900">{context.coverageYear || '2026'}</span>
          </div>
          <div>
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">ZIP / State</span>
            <span className="text-xs font-bold text-slate-900">
              {context.zipCode ? `${context.zipCode}${context.state ? `, ${context.state}` : ''}` : '—'}
            </span>
          </div>
          <div>
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">County</span>
            <span className="text-xs font-bold text-slate-900 truncate block">
              {context.countyName || 'Standard Service Area'}
            </span>
          </div>
          <div>
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Household Income</span>
            <span className="text-xs font-bold text-slate-900">
              {context.householdIncome ? `$${Number(context.householdIncome).toLocaleString()}` : 'Not specified'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. PLAN ID SEARCH INPUT BAR */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Plan ID Search</h3>
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 w-full relative">
            <input
              type="text"
              value={planIdInput}
              onChange={(e) => setPlanIdInput(e.target.value)}
              placeholder="Enter 14-digit Plan ID (e.g. 30252FL0070065)..."
              disabled={loading}
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs text-slate-900 font-bold uppercase tracking-wider outline-none transition-all placeholder-normal"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 sm:flex-initial px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] rounded-xl transition-all shadow-md shadow-blue-500/10 flex items-center justify-center gap-2"
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
                className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
              >
                Clear
              </button>
            )}
          </div>
        </form>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold">
            ⚠️ {errorMsg}
          </div>
        )}
      </div>

      {/* 3. WIDE PLAN PREVIEW WORKSPACE */}
      {activePlan && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6 animate-fadeIn">
          {/* PREVIEW HEADER */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                  {activePlan.metalLevel || 'Silver'} Plan
                </span>
                <span className="px-2.5 py-0.5 text-[10px] font-extrabold font-mono rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                  {activePlan.id}
                </span>
                {isAppliedView && (
                  <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Currently Applied
                  </span>
                )}
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">{activePlan.planName}</h3>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">{activePlan.issuerName}</p>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex items-center gap-2.5 shrink-0">
              {isAppliedView && (
                <button
                  type="button"
                  onClick={() => setShowUnlinkModal(true)}
                  disabled={unlinking}
                  className="px-4 py-2.5 text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all flex items-center gap-1.5"
                >
                  <span>🔓</span> Unlink Plan
                </button>
              )}
              {foundPlan && (
                <button
                  type="button"
                  onClick={handleCancelPreview}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                >
                  Cancel Preview
                </button>
              )}
              {foundPlan && (
                <button
                  type="button"
                  onClick={handleApplyThisPlan}
                  disabled={applying}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] rounded-xl transition-all shadow-md shadow-emerald-500/10 flex items-center gap-2"
                >
                  {applying ? 'Applying Plan...' : '✓ Apply This Plan'}
                </button>
              )}
            </div>
          </div>

          {applyError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold">
              {applyError}
            </div>
          )}

          {/* SUMMARY METRICS GRID */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-slate-50 border border-slate-200/70 p-3.5 rounded-xl">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Plan Cost (Full)</span>
              <span className="text-sm font-bold text-slate-800 mt-0.5 block">{formatCurrency(activePlan.premiumFull)}</span>
            </div>

            <div className="bg-slate-50 border border-slate-200/70 p-3.5 rounded-xl">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Tax Credit (APTC)</span>
              <span className="text-sm font-bold text-emerald-600 mt-0.5 block">-{formatCurrency(activePlan.taxCredit)}</span>
            </div>

            <div className="bg-blue-50/70 border border-blue-200/80 p-3.5 rounded-xl">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-blue-600">Final Monthly</span>
              <span className="text-base font-extrabold text-blue-700 mt-0.5 block">{formatCurrency(activePlan.premiumNet)}</span>
            </div>

            <div className="bg-slate-50 border border-slate-200/70 p-3.5 rounded-xl">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Deductible</span>
              <span className="text-sm font-bold text-slate-800 mt-0.5 block">
                {activePlan.deductibleIndividual !== null ? formatCurrency(activePlan.deductibleIndividual) : '—'}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200/70 p-3.5 rounded-xl">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Max Out-of-Pocket</span>
              <span className="text-sm font-bold text-slate-800 mt-0.5 block">
                {activePlan.oopMaxIndividual !== null ? formatCurrency(activePlan.oopMaxIndividual) : '—'}
              </span>
            </div>
          </div>

          {/* OFFICIAL DOCUMENTS */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Official Documents</span>
            <div className="flex flex-wrap items-center gap-2">
              {activePlan.benefitsUrl ? (
                <a
                  href={activePlan.benefitsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl transition-all flex items-center gap-1.5"
                >
                  <span>📄</span> Summary of Benefits (SBC) ↗
                </a>
              ) : (
                <span className="px-3 py-1 text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                  SBC Unavailable
                </span>
              )}

              {activePlan.brochureUrl && (
                <a
                  href={activePlan.brochureUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 rounded-xl transition-all flex items-center gap-1.5"
                >
                  <span>📘</span> Plan Brochure ↗
                </a>
              )}

              {activePlan.formularyUrl && (
                <a
                  href={activePlan.formularyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 rounded-xl transition-all flex items-center gap-1.5"
                >
                  <span>💊</span> Drug Formulary ↗
                </a>
              )}

              {activePlan.networkUrl && (
                <a
                  href={activePlan.networkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 rounded-xl transition-all flex items-center gap-1.5"
                >
                  <span>🏥</span> Provider Directory ↗
                </a>
              )}
            </div>
          </div>

          {/* 4. PLAN BENEFITS & SERVICES SECTION */}
          <div className="space-y-4 border-t border-slate-100 pt-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                  Plan Benefits & Services ({filteredBenefits.length})
                </h4>
                <button
                  type="button"
                  onClick={() => setIsBenefitsExpanded(!isBenefitsExpanded)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800"
                >
                  {isBenefitsExpanded ? '[ Hide Benefits ]' : '[ Show Benefits ]'}
                </button>
              </div>

              {/* LOCAL BENEFIT SEARCH INPUT BAR */}
              <div className="relative w-full sm:w-80">
                <input
                  type="text"
                  value={benefitSearchQuery}
                  onChange={(e) => setBenefitSearchQuery(e.target.value)}
                  placeholder="Filter benefits (e.g. specialist, doctor, rx)..."
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl pl-3 pr-8 py-1.5 text-xs text-slate-800 font-semibold outline-none transition-all"
                />
                {benefitSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setBenefitSearchQuery('')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {isBenefitsExpanded && (
              <div className="space-y-5 animate-fadeIn">
                {filteredBenefits.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-8 text-center space-y-2">
                    <p className="text-xs font-bold text-slate-600">No benefits match your search term "{benefitSearchQuery}".</p>
                    <button
                      type="button"
                      onClick={() => setBenefitSearchQuery('')}
                      className="px-3.5 py-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Clear Benefit Search
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupedBenefits.map(([category, items]) => (
                      <div key={category} className="space-y-2.5">
                        <h5 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-200/60 pb-1">
                          {category}
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {items.map((b, idx) => (
                            <div
                              key={`${b.serviceName}_${idx}`}
                              className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3.5 space-y-1 hover:border-slate-300 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-bold text-slate-900 text-xs">{b.serviceName}</span>
                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md shrink-0 ${
                                  b.coverageStatus === 'Covered'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}>
                                  {b.coverageStatus || 'Covered'}
                                </span>
                              </div>
                              <div className="text-xs font-extrabold text-blue-700 pt-0.5">
                                {b.individualValue || 'No copay specified'}
                              </div>
                              {b.limitations && (
                                <p className="text-[11px] text-slate-500 font-medium pt-0.5 leading-snug">
                                  {b.limitations}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
