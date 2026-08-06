const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(targetFile, 'utf-8');

const oldRecentPoliciesBlock = content.substring(
  content.indexOf("{/* Recent Policies Section */}"),
  content.indexOf("{/* Linked Company Policies Section in Overview */}")
);

const newRecentPoliciesBlock = `{/* Consolidated Overview Policies Section */}
                      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4 font-sans">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                          <div>
                            <h4 className="text-base font-extrabold text-slate-900">Active Client Policies</h4>
                            <p className="text-xs text-slate-400">Consolidated policies across Health, Property & Casualty, and Life Insurance</p>
                          </div>
                          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                            {consolidatedOverviewCards.length} Total Policy / Policies
                          </span>
                        </div>

                        {consolidatedOverviewCards.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-xl">
                            No policies recorded for this client yet.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {consolidatedOverviewCards.map((card) => (
                              <div
                                key={card.id}
                                className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-300 transition-all"
                              >
                                <div className="space-y-1.5 min-w-0 flex-1">
                                  {/* Badges */}
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
                                      {card.businessLineLabel}
                                    </span>
                                    <span
                                      className={\`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase \${
                                        card.status === 'Active'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                          : card.status === 'Cancelled'
                                          ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                          : 'bg-amber-50 text-amber-700 border border-amber-100'
                                      }\`}
                                    >
                                      {card.status}
                                    </span>
                                    <span className="font-extrabold text-slate-900 text-sm">
                                      {card.policy_type} {card.policy_number !== 'N/A' ? '| #' + card.policy_number : ''}
                                    </span>
                                  </div>

                                  {/* Company */}
                                  <div className="text-xs text-slate-500 font-medium">
                                    Carrier/Company: <strong>{card.company_name}</strong>
                                  </div>

                                  {/* Dates & Premium */}
                                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                                    {card.effective_date && (
                                      <div>
                                        Term: <strong className="text-slate-800">{formatIsoToUsDate(card.effective_date)} {card.expiration_date ? 'to ' + formatIsoToUsDate(card.expiration_date) : ''}</strong>
                                      </div>
                                    )}
                                    {card.premium > 0 && (
                                      <div>
                                        Premium: <strong className="text-emerald-600">{formatCurrency(card.premium)}</strong>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-3 justify-end flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleTabChange(card.targetTab);
                                      setTimeout(() => {
                                        const targetEl = document.getElementById('life-policy-' + card.id) || document.getElementById('policy-' + card.id);
                                        if (targetEl) {
                                          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        }
                                      }, 150);
                                    }}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white border border-slate-200 hover:border-indigo-200 px-4 py-2 rounded-xl shadow-xs transition-all flex items-center gap-1"
                                  >
                                    View Policy
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      `;

content = content.replace(oldRecentPoliciesBlock, newRecentPoliciesBlock);

fs.writeFileSync(targetFile, content, 'utf-8');
console.log('Successfully updated consolidated Overview policy cards and exact policy navigation!');
