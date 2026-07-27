'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Lead, LeadDocument } from '@/lib/leads/types';
import { validateLeadFile, formatBytes, getLeadFileSignedUrl, logTimelineEvent } from '@/lib/leads/fileUtils';
import { formatIsoToUsDate } from '@/utils/dateUtils';

interface LeadDocumentsTabProps {
  lead: Lead;
  onActivityLogged: () => void;
}

const DOCUMENT_TYPES = [
  'Identification',
  'Application',
  'Quote',
  'Supporting Document',
  'Correspondence',
  'Other',
];

export default function LeadDocumentsTab({ lead, onActivityLogged }: LeadDocumentsTabProps) {
  const [documents, setDocuments] = useState<LeadDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload Form State
  const [displayName, setDisplayName] = useState('');
  const [documentType, setDocumentType] = useState('Supporting Document');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Edit Metadata State
  const [editingDoc, setEditingDoc] = useState<LeadDocument | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editDocumentType, setEditDocumentType] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete Confirmation State
  const [deletingDoc, setDeletingDoc] = useState<LeadDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load Documents
  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error: fetchErr } = await supabase
        .from('lead_documents')
        .select('*')
        .eq('lead_id', lead.id)
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      setDocuments(data || []);
    } catch (err: any) {
      console.error('Error loading documents:', err);
      setError(err?.message || 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Upload New Document with Orphan Cleanup
  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a file to upload.');
      return;
    }

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError('Display Name is required.');
      return;
    }

    const validationErr = validateLeadFile(selectedFile);
    if (validationErr) {
      setError(validationErr);
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated.');

      const storageFilename = `${crypto.randomUUID()}-${selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const storagePath = `${user.id}/${lead.id}/documents/${storageFilename}`;

      // 1. Upload to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from('lead-files')
        .upload(storagePath, selectedFile, {
          contentType: selectedFile.type,
          upsert: false,
        });

      if (uploadErr) throw uploadErr;

      // 2. Insert DB Metadata Record
      const { error: dbErr } = await supabase
        .from('lead_documents')
        .insert({
          lead_id: lead.id,
          agent_id: user.id,
          display_name: trimmedName,
          document_type: documentType,
          description: description.trim() || null,
          original_filename: selectedFile.name,
          storage_path: storagePath,
          mime_type: selectedFile.type || null,
          size_bytes: selectedFile.size,
        });

      if (dbErr) {
        // Cleanup storage file to prevent orphaned storage objects
        await supabase.storage.from('lead-files').remove([storagePath]);
        throw dbErr;
      }

      // 3. Log Timeline Event
      await logTimelineEvent(
        lead.id,
        'document_uploaded',
        `Uploaded "${trimmedName}" (${documentType}).`,
        { filename: selectedFile.name, type: documentType }
      );

      // Reset form
      setDisplayName('');
      setDescription('');
      setSelectedFile(null);

      loadDocuments();
      onActivityLogged();
    } catch (err: any) {
      console.error('Error uploading document:', err);
      setError(err?.message || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  // Open / Download Document
  const handleOpenDocument = async (doc: LeadDocument) => {
    const signedUrl = await getLeadFileSignedUrl(doc.storage_path);
    if (signedUrl) {
      window.open(signedUrl, '_blank');
    } else {
      setError('Failed to generate download URL for document.');
    }
  };

  // Save Document Metadata Edits
  const handleSaveEditMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;

    const trimmedName = editDisplayName.trim();
    if (!trimmedName) {
      setError('Display Name is required.');
      return;
    }

    try {
      setSavingEdit(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error: updateErr } = await supabase
        .from('lead_documents')
        .update({
          display_name: trimmedName,
          document_type: editDocumentType,
          description: editDescription.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingDoc.id)
        .eq('agent_id', user.id);

      if (updateErr) throw updateErr;

      await logTimelineEvent(
        lead.id,
        'document_updated',
        `Updated document details for "${trimmedName}".`
      );

      setEditingDoc(null);
      loadDocuments();
      onActivityLogged();
    } catch (err: any) {
      console.error('Error updating document metadata:', err);
      setError(err?.message || 'Failed to update document.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Execute Delete Document with Decoupled Cleanup Order
  const handleDeleteDocument = async () => {
    if (!deletingDoc) return;

    try {
      setDeleting(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Remove storage object first
      const { error: storageErr } = await supabase.storage
        .from('lead-files')
        .remove([deletingDoc.storage_path]);

      if (storageErr) {
        throw new Error(`Storage file deletion failed: ${storageErr.message}. Document record preserved.`);
      }

      // 2. Remove DB record only after storage removal succeeds
      const { error: dbErr } = await supabase
        .from('lead_documents')
        .delete()
        .eq('id', deletingDoc.id)
        .eq('agent_id', user.id);

      if (dbErr) {
        throw new Error(`Inconsistency warning: Storage file deleted but database document record removal failed: ${dbErr.message}`);
      }

      await logTimelineEvent(
        lead.id,
        'document_deleted',
        `Deleted document "${deletingDoc.display_name}".`
      );

      setDeletingDoc(null);
      loadDocuments();
      onActivityLogged();
    } catch (err: any) {
      console.error('Error deleting document:', err);
      setError(err?.message || 'Failed to delete document.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {error}
        </div>
      )}

      {/* UPLOAD DOCUMENT FORM */}
      <form onSubmit={handleUploadDocument} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-slate-200">Upload New Document</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Display Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Drivers License Copy"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none focus:border-blue-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Document Type</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none focus:border-blue-500/50"
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add optional document notes or context..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 outline-none focus:border-blue-500/50"
            />
          </div>

          <div className="sm:col-span-2 flex items-center justify-between border-t border-slate-800/80 pt-4">
            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {selectedFile ? 'Change File' : 'Choose File'}
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const err = validateLeadFile(file);
                      if (err) {
                        setError(err);
                        return;
                      }
                      setSelectedFile(file);
                      if (!displayName) {
                        setDisplayName(file.name.replace(/\.[^/.]+$/, ''));
                      }
                    }
                  }}
                />
              </label>
              {selectedFile && (
                <span className="text-xs text-slate-300 font-medium">
                  {selectedFile.name} <span className="text-slate-500">({formatBytes(selectedFile.size)})</span>
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white text-xs font-semibold shadow-lg transition-all disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        </div>
      </form>

      {/* DOCUMENTS LIST */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">Documents ({documents.length})</h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            Loading documents...
          </div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No documents uploaded for this lead yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Document</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Filename / Size</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-100">{doc.display_name}</div>
                      {doc.description && (
                        <div className="text-[11px] text-slate-400 mt-0.5">{doc.description}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        {doc.document_type || 'Other'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-[11px] text-slate-300">{doc.original_filename}</div>
                      <div className="text-[10px] text-slate-500">{formatBytes(doc.size_bytes)}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {formatIsoToUsDate(doc.created_at)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenDocument(doc)}
                          className="px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-[11px] font-medium transition-colors border border-blue-500/30"
                        >
                          Open / Download
                        </button>
                        <button
                          onClick={() => {
                            setEditingDoc(doc);
                            setEditDisplayName(doc.display_name);
                            setEditDocumentType(doc.document_type || 'Other');
                            setEditDescription(doc.description || '');
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingDoc(doc)}
                          className="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] font-medium transition-colors border border-rose-500/20"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* EDIT METADATA MODAL */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-100">Edit Document Metadata</h3>
            <form onSubmit={handleSaveEditMetadata} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Document Type</label>
                <select
                  value={editDocumentType}
                  onChange={(e) => setEditDocumentType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none"
                >
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  {savingEdit ? 'Saving...' : 'Save Metadata'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE DOCUMENT CONFIRMATION MODAL */}
      {deletingDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-100">Delete Document</h3>
            <p className="text-sm text-slate-400">
              Are you sure you want to delete document <strong className="text-slate-200">{deletingDoc.display_name}</strong>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingDoc(null)}
                className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteDocument}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg"
              >
                {deleting ? 'Deleting...' : 'Delete Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
