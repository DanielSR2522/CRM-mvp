'use client';

import React, { useState, useEffect } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import { supabase } from '@/lib/supabaseClient';
import { resolveTemplateVariables } from '@/lib/consents/merge-service';
import { listClientPolicies, ComprehensiveClientPolicy } from '@/lib/consents/request-service';

interface ConsentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  htmlContent: string;
  consentText: string;
}

export default function ConsentPreviewModal({
  isOpen,
  onClose,
  title,
  htmlContent,
  consentText
}: ConsentPreviewModalProps) {
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientPolicies, setClientPolicies] = useState<ComprehensiveClientPolicy[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');

  const [renderedBody, setRenderedBody] = useState<string>('');
  const [renderedConsentText, setRenderedConsentText] = useState<string>('');
  const [loadingMerge, setLoadingMerge] = useState<boolean>(false);

  // Fetch agent's clients for test context resolution
  useEffect(() => {
    async function loadClients() {
      if (!isOpen) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        const { data } = await supabase
          .from('clients')
          .select('id, full_name, agency_name')
          .eq('agent_id', session.user.id)
          .order('full_name', { ascending: true });

        if (data) {
          setClients(data.map(c => ({
            id: c.id,
            name: c.agency_name ? `${c.agency_name} (${c.full_name})` : c.full_name
          })));
        }
      } catch (err) {
        console.error('Error loading clients for preview:', err);
      }
    }
    loadClients();
  }, [isOpen]);

  // Fetch policies when client changes
  useEffect(() => {
    async function loadPolicies() {
      if (!selectedClientId) {
        setClientPolicies([]);
        setSelectedPolicyId('');
        return;
      }
      try {
        const policies = await listClientPolicies(selectedClientId);
        setClientPolicies(policies);
        if (policies.length === 1) {
          setSelectedPolicyId(policies[0].id);
        } else {
          setSelectedPolicyId('');
        }
      } catch (err) {
        console.error('Error loading client policies for preview:', err);
      }
    }
    loadPolicies();
  }, [selectedClientId]);

  // Update rendered HTML when content, client, or policy changes
  useEffect(() => {
    async function updateRender() {
      if (!isOpen) return;

      if (!selectedClientId) {
        // Raw Token Mode
        setRenderedBody(DOMPurify.sanitize(htmlContent));
        setRenderedConsentText(consentText);
        return;
      }

      setLoadingMerge(true);
      try {
        const selectedPolicy = clientPolicies.find(p => p.id === selectedPolicyId);

        const merged = await resolveTemplateVariables({
          htmlContent,
          consentText,
          clientId: selectedClientId,
          policyId: selectedPolicyId || undefined,
          policyType: selectedPolicy?.category
        });

        setRenderedBody(DOMPurify.sanitize(merged.resolvedHtml));
        setRenderedConsentText(merged.resolvedConsentText);
      } catch (err) {
        console.error('Error resolving preview variables:', err);
        setRenderedBody(DOMPurify.sanitize(htmlContent));
        setRenderedConsentText(consentText);
      } finally {
        setLoadingMerge(false);
      }
    }
    updateRender();
  }, [isOpen, htmlContent, consentText, selectedClientId, selectedPolicyId, clientPolicies]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in font-sans">
      <div className="w-full max-w-4xl bg-white border border-slate-100 rounded-2xl shadow-2xl p-6 md:p-8 animate-scale-up max-h-[90vh] flex flex-col justify-between my-6">
        
        {/* Modal Header */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 mb-4 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  Signer Live Preview
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  {selectedClientId ? 'Resolved Client Context' : 'Raw Token Template'}
                </span>
              </div>
              <h2 className="text-xl font-black text-slate-900 mt-1">{title || 'Untitled Consent Template'}</h2>
            </div>
            
            <button
              type="button"
              onClick={onClose}
              className="self-end sm:self-auto p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Test Context Selectors */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-1">
              <label htmlFor="preview-client" className="font-bold text-slate-700 whitespace-nowrap">
                Test Client:
              </label>
              <select
                id="preview-client"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
              >
                <option value="">Raw Tokens (Template View)</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {selectedClientId && clientPolicies.length > 0 && (
              <div className="flex items-center gap-2 flex-1">
                <label htmlFor="preview-policy" className="font-bold text-slate-700 whitespace-nowrap">
                  Test Policy:
                </label>
                <select
                  id="preview-policy"
                  value={selectedPolicyId}
                  onChange={(e) => setSelectedPolicyId(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                >
                  <option value="">No Policy Selected</option>
                  {clientPolicies.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.category.toUpperCase()} · {p.policy_number || p.policy_type} ({p.company_name || 'Carrier'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {loadingMerge && (
              <span className="text-[11px] font-semibold text-blue-600 animate-pulse whitespace-nowrap">
                Resolving CRM fields...
              </span>
            )}
          </div>
        </div>

        {/* Modal Scrollable Document Body */}
        <div className="flex-1 overflow-y-auto max-h-[50vh] pr-2 space-y-6 border border-slate-100 rounded-xl p-4 bg-white shadow-inner">
          <div 
            className="prose prose-sm max-w-none text-slate-800 leading-relaxed font-sans text-xs sm:text-sm"
            dangerouslySetInnerHTML={{ __html: renderedBody || '<p className="text-slate-400 italic">No document content available.</p>' }}
          />

          {/* Rendered Consent Statement & Legal Signing Requirement Footer */}
          <div className="border-t border-slate-200 pt-4 mt-6 bg-slate-50/70 rounded-xl p-4 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Protected Legal Signing Requirements
            </h4>

            {renderedConsentText && (
              <div className="flex items-start gap-3 bg-white p-3 border border-slate-200 rounded-lg">
                <input
                  type="checkbox"
                  disabled
                  checked
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <p className="text-xs text-slate-700 font-medium">
                  {renderedConsentText}
                </p>
              </div>
            )}

            {/* Signature & Date Fields Canvas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="border border-dashed border-slate-300 rounded-lg p-3 bg-white text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Electronic Signature Pad
                </span>
                <p className="text-xs text-slate-400 font-mono italic">
                  [ Signer Signature Will Appear Here ]
                </p>
              </div>

              <div className="border border-dashed border-slate-300 rounded-lg p-3 bg-white text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Automatic Signing Date
                </span>
                <p className="text-xs text-slate-400 font-mono">
                  {new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="border-t border-slate-100 pt-4 mt-4 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            This preview illustrates how signers will view and e-sign this consent.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95"
          >
            Close Preview
          </button>
        </div>

      </div>
    </div>
  );
}
