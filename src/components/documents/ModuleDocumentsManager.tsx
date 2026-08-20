'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AssociatedPolicy } from '@/lib/notes/types';

interface Props {
  clientId: string;
  moduleType?: 'medicare' | 'supplemental' | 'health' | 'life' | 'property_casualty' | 'general' | 'all';
  policyId?: string | null;
  healthPolicyId?: string | null;
  policiesList?: AssociatedPolicy[];
  moduleLabel?: string;
}

export default function ModuleDocumentsManager({
  clientId,
  moduleType = 'all',
  policyId = null,
  healthPolicyId = null,
  policiesList = [],
  moduleLabel,
}: Props) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters for central view mode
  const [activeModuleFilter, setActiveModuleFilter] = useState<string>(moduleType || 'all');
  const [selectedModuleType, setSelectedModuleType] = useState<string>(
    moduleType !== 'all' ? moduleType : 'general'
  );
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(policyId || healthPolicyId || '');

  const [displayName, setDisplayName] = useState('');
  const [documentType, setDocumentType] = useState('Document');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Sync props if changed
  useEffect(() => {
    if (moduleType && moduleType !== 'all') {
      setSelectedModuleType(moduleType);
    }
  }, [moduleType]);

  useEffect(() => {
    if (policyId) {
      setSelectedPolicyId(policyId);
    } else if (healthPolicyId) {
      setSelectedPolicyId(healthPolicyId);
    }
  }, [policyId, healthPolicyId]);

  // Filter policies dropdown based on selected module type
  const filteredPoliciesForDropdown = useMemo(() => {
    if (!selectedModuleType || selectedModuleType === 'general') return [];
    return policiesList.filter(p => {
      if (selectedModuleType === 'health') return p.isHealth === true;
      if (p.isHealth === true) return false;
      if (!p.policy_type) return true;
      const typeLower = p.policy_type.toLowerCase();
      if (selectedModuleType === 'life') return typeLower.includes('life');
      if (selectedModuleType === 'supplemental') return typeLower.includes('supplemental') || typeLower.includes('accident') || typeLower.includes('critical');
      if (selectedModuleType === 'medicare') return typeLower.includes('medicare') || typeLower.includes('part d') || typeLower.includes('advantage') || typeLower.includes('medigap') || typeLower.includes('part c');
      return true;
    });
  }, [selectedModuleType, policiesList]);

  // Load documents
  const loadDocuments = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('client_documents')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (moduleType !== 'all') {
        query = query.eq('module_type', moduleType);
      } else if (activeModuleFilter !== 'all') {
        query = query.eq('module_type', activeModuleFilter);
      }

      if (healthPolicyId) {
        query = query.eq('health_policy_id', healthPolicyId);
      } else if (policyId) {
        query = query.eq('policy_id', policyId);
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setDocuments(data || []);
    } catch (err: any) {
      console.error('Error loading module documents:', err);
      setError(err?.message || 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }, [clientId, moduleType, activeModuleFilter, policyId, healthPolicyId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Helper to generate signed URLs with fallback across buckets
  const getSignedUrlForDoc = async (storagePath: string): Promise<string | null> => {
    try {
      let { data, error: err } = await supabase.storage.from('crm-documents').createSignedUrl(storagePath, 300);
      if (!err && data?.signedUrl) return data.signedUrl;

      const buckets = ['policy-documents', 'health-documents', 'health-policy-documents'];
      for (const b of buckets) {
        const res = await supabase.storage.from(b).createSignedUrl(storagePath, 300);
        if (!res.error && res.data?.signedUrl) return res.data.signedUrl;
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a file to upload.');
      return;
    }

    setUploading(true);
    setError(null);

    let storagePath: string | null = null;

    try {
      const { data: userData } = await supabase.auth.getUser();
      let currentUserId = userData?.user?.id;

      if (!currentUserId) {
        const { data: sessionData } = await supabase.auth.getSession();
        currentUserId = sessionData?.session?.user?.id;
      }

      if (!currentUserId && clientId) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('agent_id')
          .eq('id', clientId)
          .single();
        currentUserId = clientData?.agent_id || null;
      }

      if (!currentUserId) {
        throw new Error('Authenticated agent profile is required to upload documents.');
      }

      // Security Ownership Validation
      let targetPolicyId: string | null = policyId || null;
      let targetHealthPolicyId: string | null = healthPolicyId || null;

      if (!policyId && !healthPolicyId && selectedPolicyId) {
        const selectedPolicyObj = policiesList.find(p => p.id === selectedPolicyId);
        if (selectedPolicyObj?.isHealth) {
          targetHealthPolicyId = selectedPolicyObj.id;
          targetPolicyId = null;
        } else {
          targetPolicyId = selectedPolicyId;
          targetHealthPolicyId = null;
        }
      }

      if (targetPolicyId) {
        const { data: pCheck, error: pErr } = await supabase
          .from('policies')
          .select('client_id')
          .eq('id', targetPolicyId)
          .single();

        if (pErr || !pCheck || pCheck.client_id !== clientId) {
          throw new Error('Security error: Selected policy does not belong to this client.');
        }
      }

      if (targetHealthPolicyId) {
        const { data: hCheck, error: hErr } = await supabase
          .from('health_policies')
          .select('client_id')
          .eq('id', targetHealthPolicyId)
          .single();

        if (hErr || !hCheck || hCheck.client_id !== clientId) {
          throw new Error('Security error: Selected Health policy does not belong to this client.');
        }
      }

      const fileExt = selectedFile.name.split('.').pop() || 'bin';
      storagePath = `${clientId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

      // Upload file to canonical Supabase storage bucket 'crm-documents'
      const { error: storageErr } = await supabase.storage
        .from('crm-documents')
        .upload(storagePath, selectedFile);

      if (storageErr) throw storageErr;

      // Insert document record into client_documents table
      const docPayload = {
        client_id: clientId,
        agent_id: currentUserId,
        display_name: displayName.trim() || selectedFile.name,
        document_type: documentType || 'Document',
        original_filename: selectedFile.name,
        storage_path: storagePath,
        mime_type: selectedFile.type || 'application/octet-stream',
        size_bytes: selectedFile.size,
        module_type: selectedModuleType || 'general',
        policy_id: targetPolicyId || null,
        health_policy_id: targetHealthPolicyId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: dbErr } = await supabase
        .from('client_documents')
        .insert(docPayload);

      if (dbErr) {
        if (storagePath) {
          await supabase.storage.from('crm-documents').remove([storagePath]);
        }
        throw dbErr;
      }

      setDisplayName('');
      setSelectedFile(null);
      if (!policyId && !healthPolicyId) setSelectedPolicyId('');
      await loadDocuments();
    } catch (err: any) {
      console.error('Error uploading document:', err);
      setError(err?.message || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: any) => {
    if (!confirm(`Are you sure you want to delete "${doc.display_name}"?`)) return;
    setDeletingId(doc.id);
    try {
      await supabase.storage.from('crm-documents').remove([doc.storage_path]);
      const { error: delErr } = await supabase.from('client_documents').delete().eq('id', doc.id);
      if (delErr) throw delErr;
      await loadDocuments();
    } catch (err: any) {
      console.error('Error deleting document:', err);
      setError(err?.message || 'Failed to delete document.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadOrPreview = async (doc: any) => {
    try {
      const signedUrl = await getSignedUrlForDoc(doc.storage_path);
      if (signedUrl) {
        window.open(signedUrl, '_blank');
      } else {
        alert('Could not generate preview/download link for file.');
      }
    } catch (err: any) {
      console.error('Error generating document link:', err);
      alert('Failed to generate preview/download link.');
    }
  };

  // Helper to render policy metadata context badge
  const renderPolicyContextBadge = (doc: any) => {
    if (doc.health_policy_id) {
      const hpObj = policiesList.find(p => p.id === doc.health_policy_id);
      return (
        <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
          Health Policy {hpObj ? `— ${hpObj.company_name || hpObj.writing_company} (#${hpObj.policy_number})` : ''}
        </span>
      );
    }

    if (doc.policy_id) {
      const pObj = policiesList.find(p => p.id === doc.policy_id);
      return (
        <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
          {pObj?.policy_type || doc.module_type || 'Policy'} {pObj ? `— ${pObj.company_name || pObj.writing_company} (#${pObj.policy_number})` : ''}
        </span>
      );
    }

    return (
      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200 rounded-md">
        General Document
      </span>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-800">
            {moduleLabel || (moduleType !== 'all' ? `${moduleType.toUpperCase().replace('_', ' & ')} DOCUMENTS` : 'CLIENT DOCUMENTS CENTER')}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {moduleType !== 'all' ? 'Upload, view, and manage documents for this module.' : 'Central repository for general and policy-specific client documents.'}
          </p>
        </div>

        {/* Central Module Filters */}
        {moduleType === 'all' && (
          <div className="flex items-center gap-1.5 flex-wrap bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            {['all', 'health', 'life', 'property_casualty', 'supplemental', 'medicare', 'general'].map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setActiveModuleFilter(m)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all capitalize ${
                  activeModuleFilter === m
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m.replace('_', ' & ')}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Upload Form */}
      <form onSubmit={handleUpload} className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Module Selector if central mode */}
          {moduleType === 'all' && (
            <div>
              <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                Module / Category
              </label>
              <select
                value={selectedModuleType}
                onChange={e => {
                  setSelectedModuleType(e.target.value);
                  setSelectedPolicyId('');
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none"
              >
                <option value="general">General Client Document</option>
                <option value="health">Health</option>
                <option value="life">Life</option>
                <option value="property_casualty">Property & Casualty</option>
                <option value="supplemental">Supplemental</option>
                <option value="medicare">Medicare</option>
              </select>
            </div>
          )}

          {/* Policy Selector if policies exist */}
          {!policyId && !healthPolicyId && selectedModuleType !== 'general' && (
            <div>
              <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                Target Policy (Optional)
              </label>
              <select
                value={selectedPolicyId}
                onChange={e => setSelectedPolicyId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none"
              >
                <option value="">-- General Module Document --</option>
                {filteredPoliciesForDropdown.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.isHealth ? '[Health] ' : ''}{p.policy_type || 'Policy'} {p.policy_number ? `(#${p.policy_number})` : ''} {p.writing_company || p.company_name ? `- ${p.writing_company || p.company_name}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">
              Document Title / Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. Drivers License, Application"
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">
              Document Type
            </label>
            <select
              value={documentType}
              onChange={e => setDocumentType(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none"
            >
              <option value="Document">Document</option>
              <option value="Policy Application">Policy Application</option>
              <option value="ID Card / License">ID Card / License</option>
              <option value="Declaration Page">Declaration Page</option>
              <option value="Proof of Income">Proof of Income</option>
              <option value="Consent Form">Consent Form</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <input
            type="file"
            onChange={e => setSelectedFile(e.target.files?.[0] || null)}
            className="text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />

          <button
            type="submit"
            disabled={uploading || !selectedFile}
            className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl transition shadow-md disabled:opacity-50"
          >
            {uploading ? 'Uploading File...' : 'Upload Document'}
          </button>
        </div>
      </form>

      {/* Documents Grid / Table */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <p className="text-sm font-bold text-slate-600">No documents found for this view.</p>
          <p className="text-xs text-slate-400 mt-1">Use the upload form above to add a new document.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {documents.map(doc => (
            <div key={doc.id} className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 flex items-center justify-between gap-3 shadow-2xs hover:border-slate-300 transition-all">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-600 font-extrabold text-sm shrink-0 shadow-2xs">
                  📄
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-extrabold text-slate-900 truncate" title={doc.display_name}>
                    {doc.display_name}
                  </span>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {renderPolicyContextBadge(doc)}
                    <span className="text-[10px] font-medium text-slate-500">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownloadOrPreview(doc)}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold rounded-lg shadow-2xs transition"
                >
                  Preview / Download
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(doc)}
                  disabled={deletingId === doc.id}
                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg font-bold text-xs transition disabled:opacity-50"
                  title="Delete Document"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
