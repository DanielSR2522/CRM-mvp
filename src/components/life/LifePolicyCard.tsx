'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import LifePolicyProducts, { LifePolicyProduct } from './LifePolicyProducts';
import LifePolicyBeneficiaries, { LifePolicyBeneficiary } from './LifePolicyBeneficiaries';
import LifePolicyDocuments from './LifePolicyDocuments';
import LifePolicyNotes from './LifePolicyNotes';
import LifePolicyTimeline from './LifePolicyTimeline';

export interface LifePolicy {
  id: string;
  client_id: string;
  policy_number: string | null;
  status: 'Active' | 'Pending' | 'Cancelled' | 'Expired';
  effective_date: string | null;
  expiration_date: string | null;
  notes_summary: string | null;
  created_at: string;
  updated_at: string;
}

interface LifePolicyCardProps {
  policy: LifePolicy;
  index: number;
  onPolicyUpdated: () => void;
  onPolicyDeleted: () => void;
  defaultExpanded?: boolean;
}

type PolicySubTab = 'summary' | 'documents' | 'notes' | 'timeline';

export default function LifePolicyCard({
  policy,
  index,
  onPolicyUpdated,
  onPolicyDeleted,
  defaultExpanded = true,
}: LifePolicyCardProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [activeSubTab, setActiveSubTab] = useState<PolicySubTab>('summary');

  // Stats for Counts
  const [products, setProducts] = useState<LifePolicyProduct[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<LifePolicyBeneficiary[]>([]);
  const [docCount, setDocCount] = useState<number>(0);
  const [noteCount, setNoteCount] = useState<number>(0);

  const loadSummaryStats = useCallback(async () => {
    try {
      const [
        { data: prodData },
        { data: benData },
        { count: docs },
        { count: notes },
      ] = await Promise.all([
        supabase.from('life_policy_products').select('*').eq('life_policy_id', policy.id),
        supabase.from('life_policy_beneficiaries').select('*').eq('life_policy_id', policy.id),
        supabase.from('life_policy_documents').select('*', { count: 'exact', head: true }).eq('life_policy_id', policy.id),
        supabase.from('life_policy_notes').select('*', { count: 'exact', head: true }).eq('life_policy_id', policy.id),
      ]);

      setProducts(prodData || []);
      setBeneficiaries(benData || []);
      setDocCount(docs || 0);
      setNoteCount(notes || 0);
    } catch (err) {
      console.error('Failed to load summary stats:', err);
    }
  }, [policy.id]);

  useEffect(() => {
    loadSummaryStats();
  }, [loadSummaryStats]);

  const handleDeletePolicy = async () => {
    if (!confirm(`Are you sure you want to delete Life Policy #${index + 1}? All products, beneficiaries, documents, and notes for this policy will be deleted.`)) {
      return;
    }

    try {
      const { error } = await supabase.from('life_policies').delete().eq('id', policy.id);
      if (error) throw error;
      onPolicyDeleted();
    } catch (err: any) {
      console.error('Failed to delete policy:', err);
      alert('Failed to delete policy: ' + err.message);
    }
  };

  return (
    <div id={`life-policy-${policy.id}`} className="bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden mb-6">
      {/* Header Bar */}
      <div className="bg-slate-50 border-b border-slate-200/80 p-4 flex items-center justify-between gap-4 font-sans">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-900 transition-all"
          >
            <svg
              className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Life Policy #{index + 1}
              </span>
            </div>
            <h4 className="text-sm font-extrabold text-slate-900 mt-0.5">
              {products.length > 0
                ? `${products[0].company || products[0].product_type} (${products[0].product_type})`
                : 'Life Policy Record'}
            </h4>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDeletePolicy}
          className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl transition-all"
        >
          Delete Policy
        </button>
      </div>

      {/* Collapsible Body */}
      {isExpanded && (
        <div className="p-6 space-y-6">
          {/* Sub-Tabs Bar */}
          <div className="border-b border-slate-200 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setActiveSubTab('summary')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all ${
                activeSubTab === 'summary'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('documents')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all ${
                activeSubTab === 'documents'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Documents ({docCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('notes')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all ${
                activeSubTab === 'notes'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Notes ({noteCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('timeline')}
              className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all ${
                activeSubTab === 'timeline'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Timeline
            </button>
          </div>

          {/* Sub-Tab Contents */}
          <div className="pt-2">
            {activeSubTab === 'summary' && (
              <div className="space-y-6 font-sans">
                {/* 1. Products Section inside Summary */}
                <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                    <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                      <span>📦 Policy Products</span>
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                        {products.length} Product(s)
                      </span>
                    </h4>
                  </div>
                  <LifePolicyProducts
                    lifePolicyId={policy.id}
                    onProductsChange={() => {
                      loadSummaryStats();
                      onPolicyUpdated();
                    }}
                  />
                </div>

                {/* 2. Beneficiaries Section inside Summary */}
                <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                    <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                      <span>👥 Beneficiaries Designation</span>
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          Math.abs(beneficiaries.reduce((sum, b) => sum + (Number(b.benefit_percentage) || 0), 0) - 100) < 0.01
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {beneficiaries.reduce((sum, b) => sum + (Number(b.benefit_percentage) || 0), 0).toFixed(1)}% / 100%
                      </span>
                    </h4>
                  </div>
                  <LifePolicyBeneficiaries
                    lifePolicyId={policy.id}
                    clientId={policy.client_id}
                    onBeneficiariesChange={() => {
                      loadSummaryStats();
                      onPolicyUpdated();
                    }}
                  />
                </div>
              </div>
            )}

            {activeSubTab === 'documents' && (
              <LifePolicyDocuments
                lifePolicyId={policy.id}
                onDocumentsChange={() => {
                  loadSummaryStats();
                  onPolicyUpdated();
                }}
              />
            )}

            {activeSubTab === 'notes' && (
              <LifePolicyNotes
                lifePolicyId={policy.id}
                onNotesChange={() => {
                  loadSummaryStats();
                  onPolicyUpdated();
                }}
              />
            )}

            {activeSubTab === 'timeline' && (
              <LifePolicyTimeline lifePolicyId={policy.id} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
