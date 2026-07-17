import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { HealthPolicyDocument, HealthPolicyDocumentSection } from '@/lib/health/types';
import { fetchHealthSections, fetchHealthDocuments } from '@/lib/health/health-service';

interface HealthDocumentsProps {
  clientId: string;
  healthPolicyId: string;
  addToast: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
}

export default function HealthDocuments({
  clientId,
  healthPolicyId,
  addToast
}: HealthDocumentsProps) {
  const [sections, setSections] = useState<HealthPolicyDocumentSection[]>([]);
  const [documents, setDocuments] = useState<HealthPolicyDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const [newSectionName, setNewSectionName] = useState('');
  const [uploadingSectionId, setUploadingSectionId] = useState<string | null>(null);

  const loadDocsData = useCallback(async () => {
    try {
      setLoading(true);
      const secs = await fetchHealthSections(healthPolicyId);
      const docs = await fetchHealthDocuments(healthPolicyId);
      setSections(secs);
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents:', err);
      const message = err instanceof Error ? err.message : 'Could not fetch documents.';
      addToast({
        title: 'Error Loading Documents',
        description: message,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [healthPolicyId, addToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDocsData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadDocsData]);

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionName.trim()) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated.');

      const { data, error } = await supabase
        .from('health_policy_document_sections')
        .insert({
          health_policy_id: healthPolicyId,
          name: newSectionName.trim(),
          position: sections.length,
          created_by: session.user.id
        })
        .select('*')
        .single();

      if (error) throw error;

      setSections([...sections, data]);
      setNewSectionName('');
      addToast({
        title: 'Section Created',
        description: `Folder section "${data.name}" added successfully.`,
        type: 'success'
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      addToast({
        title: 'Failed to Create Section',
        description: message,
        type: 'error'
      });
    }
  };

  const handleUploadFile = async (sectionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSizeBytes = 20 * 1024 * 1024; // 20 MB limit
    if (file.size > maxSizeBytes) {
      addToast({
        title: 'File Too Large',
        description: 'File size must not exceed 20 MB.',
        type: 'error'
      });
      return;
    }

    setUploadingSectionId(sectionId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('You must be logged in.');

      const documentId = crypto.randomUUID();
      const storagePath = `${session.user.id}/${clientId}/${healthPolicyId}/documents/${documentId}/${file.name}`;

      // Upload physical file
      const { error: storageError } = await supabase.storage
        .from('health-policy-documents')
        .upload(storagePath, file, { cacheControl: '3600', upsert: false });

      if (storageError) throw storageError;

      // Create metadata row
      const { error: dbError } = await supabase
        .from('health_policy_documents')
        .insert({
          id: documentId,
          health_policy_id: healthPolicyId,
          section_id: sectionId,
          uploaded_by: session.user.id,
          display_name: file.name,
          original_filename: file.name,
          storage_path: storagePath,
          mime_type: file.type,
          size_bytes: file.size
        });

      if (dbError) {
        // Rollback Storage
        await supabase.storage.from('health-policy-documents').remove([storagePath]);
        throw dbError;
      }

      // Log action in Timeline
      await supabase.from('client_timeline_events').insert({
        client_id: clientId,
        event_type: 'health_document_uploaded',
        actor_id: session.user.id,
        details: {
          filename: file.name,
          size_bytes: file.size,
          health_policy_id: healthPolicyId
        }
      });

      addToast({
        title: 'Document Uploaded',
        description: `Successfully uploaded "${file.name}".`,
        type: 'success'
      });
      loadDocsData();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Could not complete file upload.';
      addToast({
        title: 'Upload Failed',
        description: message,
        type: 'error'
      });
    } finally {
      setUploadingSectionId(null);
    }
  };

  const handleDownload = async (doc: HealthPolicyDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('health-policy-documents')
        .createSignedUrl(doc.storage_path, 300); // 5 min expiry

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not retrieve download URL.';
      addToast({
        title: 'Download Failed',
        description: message,
        type: 'error'
      });
    }
  };

  const handleDeleteDocument = async (doc: HealthPolicyDocument) => {
    const confirm = window.confirm(`Are you sure you want to permanently delete "${doc.display_name}"?`);
    if (!confirm) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated.');

      // 1. Delete Storage physical object first
      const { error: storageErr } = await supabase.storage
        .from('health-policy-documents')
        .remove([doc.storage_path]);

      if (storageErr) throw storageErr;

      // 2. Delete database row only after storage deletion succeeds
      const { error: dbErr } = await supabase
        .from('health_policy_documents')
        .delete()
        .eq('id', doc.id);

      if (dbErr) throw dbErr;

      // Log in Timeline
      await supabase.from('client_timeline_events').insert({
        client_id: clientId,
        event_type: 'health_document_deleted',
        actor_id: session.user.id,
        details: {
          filename: doc.display_name,
          health_policy_id: healthPolicyId
        }
      });

      addToast({
        title: 'Document Deleted',
        description: `"${doc.display_name}" has been removed.`,
        type: 'success'
      });
      loadDocsData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove document.';
      addToast({
        title: 'Delete Failed',
        description: message,
        type: 'error'
      });
    }
  };

  const handleDeleteSection = async (section: HealthPolicyDocumentSection) => {
    const confirm = window.confirm(`Deleting section "${section.name}" will permanently remove all documents inside it. Continue?`);
    if (!confirm) return;

    try {
      const sectionDocs = documents.filter(d => d.section_id === section.id);

      // Delete storage files inside the section
      for (const doc of sectionDocs) {
        await supabase.storage.from('health-policy-documents').remove([doc.storage_path]);
      }

      // Delete section (cascade deletes db metadata documents)
      const { error } = await supabase
        .from('health_policy_document_sections')
        .delete()
        .eq('id', section.id);

      if (error) throw error;

      addToast({
        title: 'Section Deleted',
        description: `Folder "${section.name}" and its documents were removed.`,
        type: 'success'
      });
      loadDocsData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      addToast({
        title: 'Delete Section Failed',
        description: message,
        type: 'error'
      });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
        <form onSubmit={handleCreateSection} className="flex gap-3">
          <input
            type="text"
            value={newSectionName}
            onChange={e => setNewSectionName(e.target.value)}
            placeholder="New Section Folder Name... (e.g., Medical Records, Identity)"
            className="flex-1 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
          />
          <button
            type="submit"
            className="px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/10"
          >
            Create Folder
          </button>
        </form>
      </div>

      {sections.length === 0 ? (
        <div className="bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl p-12 text-center text-slate-400">
          No folders configured. Create a folder to start uploading health policy documents.
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map(sec => {
            const secDocs = documents.filter(d => d.section_id === sec.id);
            return (
              <div key={sec.id} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="font-extrabold text-slate-800 text-sm">{sec.name}</span>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">{secDocs.length} files</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1.5">
                      {uploadingSectionId === sec.id ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          <span>Upload File</span>
                        </>
                      )}
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploadingSectionId !== null}
                        onChange={e => handleUploadFile(sec.id, e)}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => handleDeleteSection(sec)}
                      className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-all"
                    >
                      Delete Folder
                    </button>
                  </div>
                </div>

                {secDocs.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs italic">
                    This folder is empty. Upload documents above.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {secDocs.map(doc => {
                      const formattedSize = doc.size_bytes > 1024 * 1024
                        ? `${(doc.size_bytes / (1024 * 1024)).toFixed(2)} MB`
                        : `${(doc.size_bytes / 1024).toFixed(1)} KB`;

                      return (
                        <div key={doc.id} className="flex items-center justify-between py-3">
                          <div className="flex items-center gap-3">
                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <div>
                              <span className="text-sm font-semibold text-slate-700 block max-w-[250px] sm:max-w-md truncate">
                                {doc.display_name}
                              </span>
                              <span className="block text-[10px] text-slate-400 mt-0.5">
                                Size: {formattedSize}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownload(doc)}
                              className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 hover:text-blue-800 transition-all"
                              title="Download/View File"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDocument(doc)}
                              className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 hover:text-rose-800 transition-all"
                              title="Delete File"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
