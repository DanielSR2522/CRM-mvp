'use client';

import React, { useState, useMemo } from 'react';
import { FilterRule, FilterGroup } from '@/app/clients/page';

export interface PolicyTypeFilterState {
  health: boolean;
  medicare: boolean;
  supplemental: boolean;
  life: boolean;
  property_casualty: boolean;
  matchMode: 'ANY' | 'ALL';
}

interface ClientsLeftFilterSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  quickFilter: 'all' | 'recently_modified' | 'recently_created' | 'not_modified' | 'my_clients';
  onSelectQuickFilter: (filter: 'all' | 'recently_modified' | 'recently_created' | 'not_modified' | 'my_clients') => void;
  policyTypeFilter: PolicyTypeFilterState;
  onPolicyTypeFilterChange: (next: PolicyTypeFilterState) => void;
  filterRules: FilterRule[];
  onAddRule: (rule: FilterRule) => void;
  onRemoveRule: (ruleId: string) => void;
  onUpdateRule: (ruleId: string, updates: Partial<FilterRule>) => void;
  onClearAll: () => void;
  onApplyFilters: () => void;
}

interface AvailableFieldDefinition {
  group: FilterGroup;
  groupLabel: string;
  fieldId: string;
  fieldLabel: string;
}

const ALL_SCHEMA_FIELDS: AvailableFieldDefinition[] = [
  // Client Fields
  { group: 'client', groupLabel: 'Client Details', fieldId: 'full_name', fieldLabel: 'Client Name' },
  { group: 'client', groupLabel: 'Client Details', fieldId: 'client_type', fieldLabel: 'Client Type' },
  { group: 'client', groupLabel: 'Client Details', fieldId: 'email', fieldLabel: 'Email Address' },
  { group: 'client', groupLabel: 'Client Details', fieldId: 'phone', fieldLabel: 'Phone Number' },
  { group: 'client', groupLabel: 'Client Details', fieldId: 'address', fieldLabel: 'Address' },
  { group: 'client', groupLabel: 'Client Details', fieldId: 'city', fieldLabel: 'City' },
  { group: 'client', groupLabel: 'Client Details', fieldId: 'state', fieldLabel: 'State' },
  { group: 'client', groupLabel: 'Client Details', fieldId: 'zip_code', fieldLabel: 'ZIP Code' },
  { group: 'client', groupLabel: 'Client Details', fieldId: 'agency_name', fieldLabel: 'Agency Name' },
  { group: 'client', groupLabel: 'Client Details', fieldId: 'created_at', fieldLabel: 'Created Date' },
  { group: 'client', groupLabel: 'Client Details', fieldId: 'updated_at', fieldLabel: 'Modified Date' },

  // Health Fields
  { group: 'health', groupLabel: 'Health', fieldId: 'policy_status', fieldLabel: 'Policy Status' },
  { group: 'health', groupLabel: 'Health', fieldId: 'company_2026', fieldLabel: 'Company 2026' },
  { group: 'health', groupLabel: 'Health', fieldId: 'company_account', fieldLabel: 'Company Account' },
  { group: 'health', groupLabel: 'Health', fieldId: 'plan_name', fieldLabel: 'Plan Name' },
  { group: 'health', groupLabel: 'Health', fieldId: 'plan_type', fieldLabel: 'Plan Type' },
  { group: 'health', groupLabel: 'Health', fieldId: 'monthly_premium', fieldLabel: 'Monthly Premium' },
  { group: 'health', groupLabel: 'Health', fieldId: 'effective_date', fieldLabel: 'Effective Date' },

  // Medicare Fields
  { group: 'medicare', groupLabel: 'Medicare', fieldId: 'policy_type', fieldLabel: 'Policy Type' },
  { group: 'medicare', groupLabel: 'Medicare', fieldId: 'writing_company', fieldLabel: 'Carrier / Company' },
  { group: 'medicare', groupLabel: 'Medicare', fieldId: 'policy_number', fieldLabel: 'Policy Number' },
  { group: 'medicare', groupLabel: 'Medicare', fieldId: 'status', fieldLabel: 'Status' },
  { group: 'medicare', groupLabel: 'Medicare', fieldId: 'effective_date', fieldLabel: 'Effective Date' },
  { group: 'medicare', groupLabel: 'Medicare', fieldId: 'expiration_date', fieldLabel: 'Expiration Date' },
  { group: 'medicare', groupLabel: 'Medicare', fieldId: 'monthly_premium', fieldLabel: 'Premium' },

  // Supplemental Fields
  { group: 'supplemental', groupLabel: 'Supplemental', fieldId: 'policy_type', fieldLabel: 'Policy Type' },
  { group: 'supplemental', groupLabel: 'Supplemental', fieldId: 'writing_company', fieldLabel: 'Carrier / Company' },
  { group: 'supplemental', groupLabel: 'Supplemental', fieldId: 'policy_number', fieldLabel: 'Policy Number' },
  { group: 'supplemental', groupLabel: 'Supplemental', fieldId: 'status', fieldLabel: 'Status' },
  { group: 'supplemental', groupLabel: 'Supplemental', fieldId: 'effective_date', fieldLabel: 'Effective Date' },
  { group: 'supplemental', groupLabel: 'Supplemental', fieldId: 'expiration_date', fieldLabel: 'Expiration Date' },
  { group: 'supplemental', groupLabel: 'Supplemental', fieldId: 'monthly_premium', fieldLabel: 'Premium' },

  // Life Fields
  { group: 'life', groupLabel: 'Life', fieldId: 'policy_type', fieldLabel: 'Policy Type' },
  { group: 'life', groupLabel: 'Life', fieldId: 'writing_company', fieldLabel: 'Carrier / Company' },
  { group: 'life', groupLabel: 'Life', fieldId: 'policy_number', fieldLabel: 'Policy Number' },
  { group: 'life', groupLabel: 'Life', fieldId: 'status', fieldLabel: 'Status' },
  { group: 'life', groupLabel: 'Life', fieldId: 'effective_date', fieldLabel: 'Effective Date' },
  { group: 'life', groupLabel: 'Life', fieldId: 'expiration_date', fieldLabel: 'Expiration Date' },
  { group: 'life', groupLabel: 'Life', fieldId: 'monthly_premium', fieldLabel: 'Premium' },

  // Property & Casualty Fields
  { group: 'property_casualty', groupLabel: 'Property & Casualty', fieldId: 'policy_type', fieldLabel: 'Policy Type (48 lines)' },
  { group: 'property_casualty', groupLabel: 'Property & Casualty', fieldId: 'policy_number', fieldLabel: 'Policy Number' },
  { group: 'property_casualty', groupLabel: 'Property & Casualty', fieldId: 'status', fieldLabel: 'Status' },
  { group: 'property_casualty', groupLabel: 'Property & Casualty', fieldId: 'writing_company', fieldLabel: 'Writing Company' },
  { group: 'property_casualty', groupLabel: 'Property & Casualty', fieldId: 'cargo', fieldLabel: 'Cargo' },
  { group: 'property_casualty', groupLabel: 'Property & Casualty', fieldId: 'effective_date', fieldLabel: 'Effective Date' },
  { group: 'property_casualty', groupLabel: 'Property & Casualty', fieldId: 'expiration_date', fieldLabel: 'Expiration Date' },
  { group: 'property_casualty', groupLabel: 'Property & Casualty', fieldId: 'annual_premium', fieldLabel: 'Annual Premium' },
  { group: 'property_casualty', groupLabel: 'Property & Casualty', fieldId: 'total_premium', fieldLabel: 'Total Premium' },
];

export default function ClientsLeftFilterSidebar({
  isOpen,
  onClose,
  quickFilter,
  onSelectQuickFilter,
  policyTypeFilter,
  onPolicyTypeFilterChange,
  filterRules,
  onAddRule,
  onRemoveRule,
  onUpdateRule,
  onClearAll,
  onApplyFilters,
}: ClientsLeftFilterSidebarProps) {
  const [filterSearchQuery, setFilterSearchQuery] = useState('');
  const [openAccordion, setOpenAccordion] = useState<FilterGroup | null>('client');

  const cleanQuery = filterSearchQuery.trim().toLowerCase();

  // Search/discovery filter fields matching term
  const matchingFields = useMemo(() => {
    if (!cleanQuery) return [];
    return ALL_SCHEMA_FIELDS.filter((f) =>
      f.fieldLabel.toLowerCase().includes(cleanQuery) || f.groupLabel.toLowerCase().includes(cleanQuery)
    );
  }, [cleanQuery]);

  // Group matching fields by module
  const groupedMatchingFields = useMemo(() => {
    const map = new Map<string, AvailableFieldDefinition[]>();
    matchingFields.forEach((f) => {
      if (!map.has(f.groupLabel)) map.set(f.groupLabel, []);
      map.get(f.groupLabel)!.push(f);
    });
    return Array.from(map.entries());
  }, [matchingFields]);

  const handleSelectDiscoveredField = (def: AvailableFieldDefinition) => {
    onAddRule({
      id: Math.random().toString(36).substring(2, 9),
      group: def.group,
      field: def.fieldId,
      operator: 'contains',
      value: '',
    });
    setOpenAccordion(def.group);
    setFilterSearchQuery('');
  };

  const handlePolicyTypeToggle = (key: keyof Omit<PolicyTypeFilterState, 'matchMode'>) => {
    onPolicyTypeFilterChange({
      ...policyTypeFilter,
      [key]: !policyTypeFilter[key],
    });
  };

  const handleMatchModeToggle = (mode: 'ANY' | 'ALL') => {
    onPolicyTypeFilterChange({
      ...policyTypeFilter,
      matchMode: mode,
    });
  };

  if (!isOpen) return null;

  return (
    <aside className="w-72 md:w-80 shrink-0 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4 font-sans text-xs flex flex-col max-h-[calc(100vh-140px)] overflow-y-auto sticky top-4 animate-fadeIn">
      {/* 1. SIDEBAR HEADER */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <span>🔍</span> FILTER CLIENTS
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors"
          title="Hide Filters Sidebar"
        >
          ✕
        </button>
      </div>

      {/* 2. FIELD-DISCOVERY INPUT (NEVER MODIFIES CLIENT QUERY) */}
      <div className="relative">
        <input
          type="text"
          value={filterSearchQuery}
          onChange={(e) => setFilterSearchQuery(e.target.value)}
          placeholder="Search available filter fields..."
          className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl pl-3 pr-8 py-2 text-xs text-slate-800 font-medium outline-none transition-all placeholder-slate-400"
        />
        {filterSearchQuery && (
          <button
            type="button"
            onClick={() => setFilterSearchQuery('')}
            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 text-xs font-bold"
          >
            ✕
          </button>
        )}
      </div>

      {/* 3. DISCOVERED MATCHING FIELDS VIEW (WHEN SEARCHING FIELDS) */}
      {cleanQuery ? (
        <div className="space-y-3 flex-1 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-[11px] font-extrabold text-blue-700 uppercase tracking-wider">
              Matching Filter Fields ({matchingFields.length})
            </span>
            <button
              type="button"
              onClick={() => setFilterSearchQuery('')}
              className="text-[11px] font-bold text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          </div>

          {matchingFields.length === 0 ? (
            <div className="p-4 text-center text-slate-400 font-medium text-xs bg-slate-50 rounded-xl border border-slate-100">
              No schema fields match "{filterSearchQuery}".
            </div>
          ) : (
            <div className="space-y-3">
              {groupedMatchingFields.map(([groupLabel, items]) => (
                <div key={groupLabel} className="space-y-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block px-1">
                    {groupLabel}
                  </span>
                  <div className="space-y-1">
                    {items.map((field) => (
                      <button
                        key={`${field.group}_${field.fieldId}`}
                        type="button"
                        onClick={() => handleSelectDiscoveredField(field)}
                        className="w-full text-left px-3 py-1.5 bg-blue-50/60 hover:bg-blue-100/70 border border-blue-100 rounded-xl font-bold text-blue-900 transition-colors flex items-center justify-between text-xs"
                      >
                        <span>{field.fieldLabel}</span>
                        <span className="text-[10px] text-blue-600 font-semibold">+ Add Rule</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* 4. STANDARD SIDEBAR STRUCTURE (WHEN NO FIELD SEARCH ACTIVE) */
        <>
          {/* QUICK FILTERS */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <span className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              Quick Filters
            </span>
            <div className="space-y-1">
              {[
                { id: 'all', label: 'All Accessible Clients' },
                { id: 'recently_modified', label: 'Recently Modified' },
                { id: 'recently_created', label: 'Recently Created' },
                { id: 'not_modified', label: 'Not Modified Recently' },
                { id: 'my_clients', label: 'My Assigned Clients' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectQuickFilter(item.id as any)}
                  className={`w-full text-left px-3 py-1.5 rounded-xl font-bold transition-all text-xs flex items-center justify-between ${
                    quickFilter === item.id
                      ? 'bg-blue-50 text-blue-700 border border-blue-100'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>{item.label}</span>
                  {quickFilter === item.id && <span className="text-blue-600">✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* POLICY TYPE GROUP */}
          <div className="space-y-2.5 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                Policy Type
              </span>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => handleMatchModeToggle('ANY')}
                  className={`px-1.5 py-0.5 rounded-md transition-all ${
                    policyTypeFilter.matchMode === 'ANY' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500'
                  }`}
                  title="Show clients matching ANY selected policy type"
                >
                  ANY
                </button>
                <button
                  type="button"
                  onClick={() => handleMatchModeToggle('ALL')}
                  className={`px-1.5 py-0.5 rounded-md transition-all ${
                    policyTypeFilter.matchMode === 'ALL' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500'
                  }`}
                  title="Show clients matching ALL selected policy types"
                >
                  ALL
                </button>
              </div>
            </div>

            <div className="space-y-1.5 bg-slate-50/70 border border-slate-200/70 rounded-xl p-2.5">
              {[
                { key: 'health', label: 'Health' },
                { key: 'medicare', label: 'Medicare' },
                { key: 'supplemental', label: 'Supplemental' },
                { key: 'life', label: 'Life' },
                { key: 'property_casualty', label: 'Property & Casualty' },
              ].map((pt) => (
                <label
                  key={pt.key}
                  className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer hover:text-slate-900 py-0.5"
                >
                  <input
                    type="checkbox"
                    checked={policyTypeFilter[pt.key as keyof Omit<PolicyTypeFilterState, 'matchMode'>]}
                    onChange={() => handlePolicyTypeToggle(pt.key as keyof Omit<PolicyTypeFilterState, 'matchMode'>)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                  />
                  <span>{pt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* FILTER BY FIELDS ACCORDIONS */}
          <div className="space-y-2 border-t border-slate-100 pt-3 flex-1">
            <span className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              Filter by Fields
            </span>

            {[
              { id: 'client', label: 'Client Fields' },
              { id: 'health', label: 'Health Fields' },
              { id: 'medicare', label: 'Medicare Fields' },
              { id: 'supplemental', label: 'Supplemental Fields' },
              { id: 'life', label: 'Life Fields' },
              { id: 'property_casualty', label: 'P&C Fields' },
            ].map((group) => {
              const isOpenGroup = openAccordion === group.id;
              const groupRules = filterRules.filter((r) => r.group === group.id);

              return (
                <div key={group.id} className="border border-slate-200/80 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenAccordion(isOpenGroup ? null : (group.id as FilterGroup))}
                    className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between font-bold text-slate-800 text-xs text-left transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span>{group.label}</span>
                      {groupRules.length > 0 && (
                        <span className="px-1.5 py-0.2 text-[10px] bg-blue-100 text-blue-800 rounded-full font-bold">
                          {groupRules.length}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400">{isOpenGroup ? '▲' : '▼'}</span>
                  </button>

                  {isOpenGroup && (
                    <div className="p-3 space-y-2.5 bg-white border-t border-slate-100 animate-fadeIn">
                      {groupRules.map((rule) => (
                        <div key={rule.id} className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <select
                              value={rule.field}
                              onChange={(e) => onUpdateRule(rule.id, { field: e.target.value })}
                              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 outline-none w-full"
                            >
                              {group.id === 'client' && (
                                <>
                                  <option value="full_name">Client Name</option>
                                  <option value="client_type">Client Type</option>
                                  <option value="email">Email</option>
                                  <option value="phone">Phone</option>
                                  <option value="city">City</option>
                                  <option value="state">State</option>
                                  <option value="zip_code">ZIP Code</option>
                                  <option value="agency_name">Agency Name</option>
                                </>
                              )}
                              {group.id === 'health' && (
                                <>
                                  <option value="policy_status">Policy Status</option>
                                  <option value="company_2026">Carrier / Company 2026</option>
                                  <option value="company_account">Company Account</option>
                                  <option value="plan_name">Plan Name</option>
                                </>
                              )}
                              {group.id === 'property_casualty' && (
                                <>
                                  <option value="policy_type">Policy Type (48 lines)</option>
                                  <option value="status">Status</option>
                                  <option value="writing_company">Writing Company</option>
                                  <option value="policy_number">Policy Number</option>
                                </>
                              )}
                              {(group.id === 'life' || group.id === 'supplemental' || group.id === 'medicare') && (
                                <>
                                  <option value="status">Status</option>
                                  <option value="writing_company">Carrier / Company</option>
                                  <option value="policy_number">Policy Number</option>
                                </>
                              )}
                            </select>
                            <button
                              type="button"
                              onClick={() => onRemoveRule(rule.id)}
                              className="text-rose-500 hover:text-rose-700 font-bold px-1.5 text-xs"
                              title="Remove rule"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <select
                              value={rule.operator}
                              onChange={(e) => onUpdateRule(rule.id, { operator: e.target.value as any })}
                              className="bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-slate-700 outline-none shrink-0"
                            >
                              <option value="contains">contains</option>
                              <option value="equals">equals</option>
                              <option value="starts_with">starts with</option>
                            </select>
                            <input
                              type="text"
                              value={rule.value}
                              onChange={(e) => onUpdateRule(rule.id, { value: e.target.value })}
                              placeholder="Value..."
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium outline-none"
                            />
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() =>
                          onAddRule({
                            id: Math.random().toString(36).substring(2, 9),
                            group: group.id as FilterGroup,
                            field: group.id === 'client' ? 'full_name' : group.id === 'property_casualty' ? 'policy_type' : 'status',
                            operator: 'contains',
                            value: '',
                          })
                        }
                        className="w-full py-1.5 text-[11px] font-bold text-blue-600 hover:bg-blue-50 border border-dashed border-blue-200 rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        + Add {group.label} Rule
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 5. BOTTOM SIDEBAR CONTROLS */}
      <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
        <button
          type="button"
          onClick={onClearAll}
          className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
        >
          Clear All
        </button>
        <button
          type="button"
          onClick={onApplyFilters}
          className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/10"
        >
          Apply Filters
        </button>
      </div>
    </aside>
  );
}
