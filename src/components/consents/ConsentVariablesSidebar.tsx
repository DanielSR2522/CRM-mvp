'use client';

import React, { useState } from 'react';
import { VARIABLE_REGISTRY, RegistryGroup, RegistryVariable } from '@/lib/consents/variable-registry';

interface ConsentVariablesSidebarProps {
  onInsertVariable: (token: string) => void;
}

export default function ConsentVariablesSidebar({ onInsertVariable }: ConsentVariablesSidebarProps) {
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    client_identity: true,
    client_address: true,
    client_household: true,
    agent: true,
    health: false,
    health_household: false,
    pc: false,
    life: false,
    life_beneficiaries: false,
    system: false,
  });

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredRegistry = VARIABLE_REGISTRY.map((group) => {
    const matchingVars = group.variables.filter((v) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        v.token.toLowerCase().includes(q) ||
        v.label.toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q)
      );
    });

    return {
      ...group,
      variables: matchingVars,
    };
  }).filter((g) => g.variables.length > 0);

  return (
    <aside className="w-80 border-l border-slate-200 bg-slate-50/60 p-2.5 flex flex-col h-full font-sans select-none overflow-hidden">
      <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs flex flex-col h-full overflow-hidden">
        {/* Header & Search */}
      <div className="p-4 border-b border-slate-200 bg-white space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <span>⚡</span> CRM Variables
          </h3>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            Click to Insert
          </span>
        </div>
        <p className="text-[11px] text-slate-500">
          Insert dynamic database variables directly into the document editor.
        </p>

        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search variables (e.g. npn, income)..."
            className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400"
          />
          <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Accordion Categories */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredRegistry.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 font-medium">
            No CRM variables match "{search}"
          </div>
        ) : (
          filteredRegistry.map((group) => {
            const isOpen = search.trim() ? true : Boolean(openGroups[group.key]);

            return (
              <div key={group.key} className="border border-slate-200 bg-white rounded-xl shadow-2xs overflow-hidden transition-all">
                {/* Group Header Button */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-50 text-left transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{group.icon || '📁'}</span>
                    <span className="text-xs font-extrabold text-slate-800">{group.label}</span>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded-md">
                      {group.variables.length}
                    </span>
                  </div>
                  <svg
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Group Variables List */}
                {isOpen && (
                  <div className="p-2 border-t border-slate-100 bg-slate-50/40 space-y-1.5">
                    {group.variables.map((item) => (
                      <button
                        key={item.token}
                        type="button"
                        onClick={() => onInsertVariable(item.token)}
                        className="w-full text-left p-2 rounded-lg bg-white border border-slate-100 hover:border-blue-300 hover:bg-blue-50/30 transition-all group/item space-y-1 shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-slate-800 group-hover/item:text-blue-600 transition-colors">
                            {item.label}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 group-hover/item:text-blue-600 bg-slate-100 group-hover/item:bg-blue-100/60 px-1.5 py-0.5 rounded">
                            {`{{${item.token}}}`}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono truncate">
                          e.g. {item.example}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      </div>
    </aside>
  );
}
