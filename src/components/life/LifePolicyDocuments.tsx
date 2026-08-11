'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import FileDropzone from '@/components/ui/FileDropzone';
import { isoDateToMMDDYYYY } from '@/lib/formatters/date';
import { DocumentPreviewModal } from '@/components/documents/DocumentPreviewModal';

export interface LifePolicyDocument {
  id: string;
  life_policy_id: string;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  file_type: string | null;
  created_at: string;
}

interface LifePolicyDocumentsProps {
  lifePolicyId: string;
  onDocumentsChange?: () => void;
}

export default function LifePolicyDocuments({ lifePolicyId, onDocumentsChange }: LifePolicyDocumentsProps) {
  const [documents, setDocuments] = useState<LifePolicyDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Preview Document State
  const [previewState, setPreviewState] = useState<{
    isOpen: boolean;
    fileName: string;
    mimeType?: string | null;
    signedUrl?: string | null;
    officePreview?: any | null;
    loading: boolean;
    error?: string | null;
    doc?: LifePolicyDocument | null;
  }>({
    isOpen: false,
    fileName: '',
    mimeType: null,
    signedUrl: null,
    officePreview: null,
    loading: false,
    error: null,
    doc: null,
  });

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('life_policy_documents')
        .select('*')
        .eq('life_policy_id', lifePolicyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (err) {
      console.error('Failed to load life policy documents:', err);
    } finally {
      setLoading(false);
    }
  }, [lifePolicyId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleFilesDropped = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadError(null);

    try {
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `life-documents/${lifePolicyId}/${Date.now()}_${cleanFileName}`;

        const { error: uploadErr } = await supabase.storage
          .from('life-documents')
          .upload(storagePath, file, { upsert: true });

        if (uploadErr) throw uploadErr;

        const { error: insertErr } = await supabase
          .from('life_policy_documents')
          .insert({
            life_policy_id: lifePolicyId,
            file_name: file.name,
            storage_path: storagePath,
            file_size: file.size,
            file_type: file.type || null,
          });

        if (insertErr) throw insertErr;
      }

      await loadDocuments();
      if (onDocumentsChange) onDocumentsChange();
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Failed to upload document:', err);
      setUploadError(err.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (doc: LifePolicyDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('life-documents')
        .createSignedUrl(doc.storage_path, 3600);

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err: any) {
      console.error('Failed to download document:', err);
      alert('Failed to download document: ' + err.message);
    }
  };

  const handlePreview = async (doc: LifePolicyDocument) => {
    const ext = (doc.file_name.split('.').pop() || '').toLowerCase();
    const isOffice = ['docx', 'xlsx', 'xls', 'pptx'].includes(ext);

    setPreviewState({
      isOpen: true,
      fileName: doc.file_name,
      mimeType: doc.file_type || null,
      signedUrl: null,
      officePreview: null,
      loading: true,
      error: null,
      doc,
    });

    if (isOffice) {
      try {
        const res = await fetch('/api/documents/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'life', docId: doc.id }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to generate document preview.');
        }

        const officeData = await res.json();
        setPreviewState((prev) => ({
          ...prev,
          loading: false,
          officePreview: officeData,
        }));
      } catch (err: any) {
        console.error('Failed to preview document:', err);
        setPreviewState((prev) => ({
          ...prev,
          loading: false,
          error: err.message || 'Unable to preview this document.',
        }));
      }
    } else {
      try {
        const { data, error } = await supabase.storage
          .from('life-documents')
          .createSignedUrl(doc.storage_path, 3600);

        if (error || !data?.signedUrl) throw error || new Error('Failed to generate signed preview URL.');

        setPreviewState((prev) => ({
          ...prev,
          loading: false,
          signedUrl: data.signedUrl,
        }));
      } catch (err: any) {
        console.error('Failed to preview document:', err);
        setPreviewState((prev) => ({
          ...prev,
          loading: false,
          error: err.message || 'Unable to preview this document.',
        }));
      }
    }
  };

  const handleDeleteDoc = async (doc: LifePolicyDocument) => {
    if (!confirm(`Are you sure you want to delete ${doc.file_name}?`)) return;
    try {
      const { error: storageErr } = await supabase.storage
        .from('life-documents')
        .remove([doc.storage_path]);

      if (storageErr) {
        console.warn('Storage deletion warning:', storageErr);
      }

      const { error: dbErr } = await supabase
        .from('life_policy_documents')
        .delete()
        .eq('id', doc.id);

      if (dbErr) throw dbErr;

      await loadDocuments();
      if (onDocumentsChange) onDocumentsChange();
    } catch (err: any) {
      console.error('Failed to delete document:', err);
      alert('Failed to delete document: ' + err.message);
    }
  };

  return (
    <div className="space-y-3 font-sans">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-sans">Policy Documents</h4>
          <p className="text-[11px] text-slate-400 font-normal">
            Upload and manage documents specific to this Life Policy
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setUploadError(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all shadow-xs font-sans"
        >
          Upload Document
        </button>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-slate-400">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-6 bg-slate-50/50 border border-dashed border-slate-200 rounded-lg text-xs text-slate-400">
          No documents uploaded for this policy yet.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-lg bg-white">
          {documents.map((doc) => (
            <div key={doc.id} className="p-3 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">{doc.file_name}</p>
                  <p className="text-[10px] text-slate-400">
                    Uploaded on {isoDateToMMDDYYYY(doc.created_at)} • {doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : 'File'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePreview(doc)}
                  className="text-xs font-bold text-slate-700 hover:text-slate-900 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 transition-all"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(doc)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-all"
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteDoc(doc)}
                  className="text-xs font-bold text-rose-600 hover:text-rose-800 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 transition-all"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 font-sans">Upload Life Policy Document</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isUploading}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {uploadError && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-semibold font-sans">
                {uploadError}
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs text-slate-500 font-sans">
                Drag and drop files here or click to browse. Max file size: 20 MB.
              </p>
              <FileDropzone
                onFilesSelected={handleFilesDropped}
                disabled={isUploading}
                loading={isUploading}
              />
            </div>

            <div className="flex items-center justify-end border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isUploading}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all font-sans"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <DocumentPreviewModal
        isOpen={previewState.isOpen}
        onClose={() => setPreviewState((prev) => ({ ...prev, isOpen: false, signedUrl: null, officePreview: null }))}
        fileName={previewState.fileName}
        mimeType={previewState.mimeType}
        signedUrl={previewState.signedUrl}
        officePreview={previewState.officePreview}
        loading={previewState.loading}
        error={previewState.error}
        onDownload={previewState.doc ? () => handleDownload(previewState.doc!) : undefined}
      />
    </div>
  );
}
