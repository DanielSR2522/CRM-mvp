'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import FileDropzone from '@/components/ui/FileDropzone';
import { isoDateToMMDDYYYY } from '@/lib/formatters/date';

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
        .createSignedUrl(doc.storage_path, 60);

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err: any) {
      console.error('Failed to download document:', err);
      alert('Failed to download document: ' + err.message);
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
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-sans">Policy Documents</h4>
        <p className="text-[11px] text-slate-400 font-normal">
          Upload and manage documents specific to this Life Policy
        </p>
      </div>

      <FileDropzone onFilesSelected={handleFilesDropped} disabled={isUploading} />

      {isUploading && (
        <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold animate-pulse">
          Uploading file(s)... Please wait.
        </div>
      )}

      {uploadError && (
        <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-lg text-rose-600 text-xs font-semibold">
          {uploadError}
        </div>
      )}

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
    </div>
  );
}
