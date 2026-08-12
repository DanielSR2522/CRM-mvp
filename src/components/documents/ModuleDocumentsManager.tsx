'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Props {
  clientId: string;
  moduleType: 'medicare' | 'supplemental' | 'health' | 'life' | 'property_casualty' | 'general';
  policyId?: string | null;
  moduleLabel?: string;
}

export default function ModuleDocumentsManager({
  clientId,
  moduleType,
  policyId = null,
  moduleLabel,
}: Props) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [documentType, setDocumentType] = useState('Document');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('client_documents')
        .select('*')
        .eq('client_id', clientId)
        .eq('module_type', moduleType)
        .order('created_at', { ascending: false });

      if (policyId) {
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
  }, [clientId, moduleType, policyId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a file to upload.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData?.user?.id;
      if (!currentUserId) throw new Error('Not authenticated.');

      const fileExt = selectedFile.name.split('.').pop() || 'bin';
      const storagePath = `${clientId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

      // Upload file to Supabase storage bucket 'client-documents'
      const { error: storageErr } = await supabase.storage
        .from('client-documents')
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
        module_type: moduleType,
        policy_id: policyId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: dbErr } = await supabase
        .from('client_documents')
        .insert(docPayload);

      if (dbErr) throw dbErr;

      setDisplayName('');
      setSelectedFile(null);
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
      // Remove from storage
      await supabase.storage.from('client-documents').remove([doc.storage_path]);
      // Delete record
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

  const handleDownload = async (doc: any) => {
    try {
      const { data, error: urlErr } = await supabase.storage
        .from('client-documents')
        .createSignedUrl(doc.storage_path, 60);

      if (urlErr) throw urlErr;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err: any) {
      console.error('Error downloading document:', err);
      alert('Failed to generate download link.');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 font-sans">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-800">
            {moduleLabel || (moduleType.charAt(0).toUpperCase() + moduleType.slice(1))} Documents
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload, view, and manage documents tied to this context. Automatically synced with General Profile Documents.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Upload Form */}
      <form onSubmit={handleUpload} className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Document Title
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Enrollment Form 2026"
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Document Type
            </label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="Document">Document</option>
              <option value="Application">Application</option>
              <option value="ID Card">ID Card</option>
              <option value="Consent">Consent</option>
              <option value="Notice">Notice</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Select File <span className="text-rose-500">*</span>
            </label>
            <input
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={uploading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl transition shadow-md disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {uploading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Uploading...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload Document
              </>
            )}
          </button>
        </div>
      </form>

      {/* Documents List */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <svg className="animate-spin h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : documents.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <p className="text-sm font-bold text-slate-600">No documents uploaded yet for this module.</p>
          <p className="text-xs text-slate-400 mt-1">Use the form above to upload a document.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-4 hover:border-slate-300 transition-all"
            >
              <div className="min-w-0 flex-1 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  📄
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-extrabold text-slate-900 truncate">{doc.display_name}</p>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">
                      {doc.document_type}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                    {doc.original_filename} • {(doc.size_bytes / 1024).toFixed(1)} KB • {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownload(doc)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
                <button
                  type="button"
                  disabled={deletingId === doc.id}
                  onClick={() => handleDelete(doc)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                  title="Delete Document"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
