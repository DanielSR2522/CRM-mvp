/* eslint-disable @next/next/no-img-element */
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { HealthPolicyNote, HealthPolicyNoteAttachment } from '@/lib/health/types';
import { fetchHealthNotes } from '@/lib/health/health-service';

interface HealthNotesProps {
  clientId: string;
  healthPolicyId: string;
  currentUserId: string | null;
  addToast: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
}

interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
}

export default function HealthNotes({
  clientId,
  healthPolicyId,
  currentUserId,
  addToast
}: HealthNotesProps) {
  const [notes, setNotes] = useState<HealthPolicyNote[]>([]);
  const [noteContent, setNoteContent] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [savedAttachments, setSavedAttachments] = useState<{ [noteId: string]: HealthPolicyNoteAttachment[] }>({});
  const [signedUrls, setSignedUrls] = useState<{ [path: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadNotesData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchHealthNotes(healthPolicyId);
      setNotes(data);

      if (data.length > 0) {
        // Fetch attachments for all notes
        const noteIds = data.map(n => n.id);
        const { data: attData, error: attErr } = await supabase
          .from('health_policy_note_attachments')
          .select('*')
          .in('note_id', noteIds);

        if (attErr) throw attErr;

        const mapping: { [noteId: string]: HealthPolicyNoteAttachment[] } = {};
        const pathsToSign: string[] = [];

        if (attData) {
          attData.forEach((att: HealthPolicyNoteAttachment) => {
            if (!mapping[att.note_id]) mapping[att.note_id] = [];
            mapping[att.note_id].push(att);
            pathsToSign.push(att.storage_path);
          });
        }
        setSavedAttachments(mapping);

        // Sign all attachment URLs
        if (pathsToSign.length > 0) {
          const { data: signedData, error: signErr } = await supabase.storage
            .from('health-policy-documents')
            .createSignedUrls(pathsToSign, 300); // 5 min expiry

          if (signErr) throw signErr;

          const urlMap: { [path: string]: string } = {};
          signedData?.forEach(item => {
            if (item.error) {
              console.error(`Sign error for ${item.path}:`, item.error);
            } else if (item.path && item.signedUrl) {
              urlMap[item.path] = item.signedUrl;
            }
          });
          setSignedUrls(urlMap);
        }
      }
    } catch (err) {
      console.error('Failed to load notes:', err);
      const message = err instanceof Error ? err.message : 'Could not fetch health notes.';
      addToast({
        title: 'Error Loading Notes',
        description: message,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [healthPolicyId, addToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadNotesData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadNotesData]);

  // Intercept Paste (Ctrl+V) from Clipboard
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const maxSizeBytes = 10 * 1024 * 1024; // 10 MB limit
          if (file.size > maxSizeBytes) {
            addToast({
              title: 'Attachment Too Large',
              description: 'Image size must not exceed 10 MB.',
              type: 'error'
            });
            continue;
          }
          const previewUrl = URL.createObjectURL(file);
          const pendingId = crypto.randomUUID();
          
          setAttachments(prev => [...prev, {
            id: pendingId,
            file,
            previewUrl
          }]);
        }
      }
    }
  };

  const handleRemovePendingAttachment = (id: string) => {
    setAttachments(prev => {
      const target = prev.find(a => a.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter(a => a.id !== id);
    });
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim() && attachments.length === 0) return;

    setSaving(true);
    const noteId = crypto.randomUUID();
    const uploadedPaths: string[] = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated.');

      // 1. Upload Attachments to private bucket
      const attachResult = { succeeded: [] as string[], failed: [] as string[] };

      for (const att of attachments) {
        const attachmentId = crypto.randomUUID();
        // Exact path layout required: auth.uid()/client_id/policy_id/notes/note_id/attachment_id/original_filename
        const storagePath = `${session.user.id}/${clientId}/${healthPolicyId}/notes/${noteId}/${attachmentId}/${att.file.name}`;

        const { error: storageError } = await supabase.storage
          .from('health-policy-documents')
          .upload(storagePath, att.file, { cacheControl: '3600', upsert: false });

        if (storageError) {
          attachResult.failed.push(att.file.name);
          continue;
        }

        // Create db record
        const { error: dbError } = await supabase
          .from('health_policy_note_attachments')
          .insert({
            id: attachmentId,
            note_id: noteId,
            health_policy_id: healthPolicyId,
            uploaded_by: session.user.id,
            display_name: att.file.name,
            original_filename: att.file.name,
            storage_path: storagePath,
            mime_type: att.file.type,
            size_bytes: att.file.size
          });

        if (dbError) {
          // Cleanup Storage
          await supabase.storage.from('health-policy-documents').remove([storagePath]);
          attachResult.failed.push(att.file.name);
        } else {
          uploadedPaths.push(storagePath);
          attachResult.succeeded.push(storagePath);
        }
      }

      if (attachResult.failed.length > 0) {
        // Rollback already uploaded files
        if (uploadedPaths.length > 0) {
          await supabase.storage.from('health-policy-documents').remove(uploadedPaths);
        }
        throw new Error(`Failed to upload these attachments: ${attachResult.failed.join(', ')}`);
      }

      // 2. Create the note record in database
      const { error: noteError } = await supabase
        .from('health_policy_notes')
        .insert({
          id: noteId,
          health_policy_id: healthPolicyId,
          author_id: session.user.id,
          content: noteContent.trim() || 'Image attached'
        });

      if (noteError) {
        // Rollback attachments
        if (uploadedPaths.length > 0) {
          await supabase.storage.from('health-policy-documents').remove(uploadedPaths);
        }
        throw noteError;
      }

      // Log in Timeline
      await supabase.from('client_timeline_events').insert({
        client_id: clientId,
        event_type: 'health_note_created',
        actor_id: session.user.id,
        details: {
          note_id: noteId,
          has_attachments: attachments.length > 0,
          health_policy_id: healthPolicyId
        }
      });

      // Clear local state
      setNoteContent('');
      attachments.forEach(a => URL.revokeObjectURL(a.previewUrl));
      setAttachments([]);

      addToast({
        title: 'Note Added',
        description: 'Your health note has been posted successfully.',
        type: 'success'
      });

      loadNotesData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      addToast({
        title: 'Failed to Add Note',
        description: message,
        type: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (note: HealthPolicyNote) => {
    const confirm = window.confirm('Are you sure you want to permanently delete this note? This action cannot be undone.');
    if (!confirm) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated.');

      // Fetch all attachments for this note
      const noteAtts = savedAttachments[note.id] || [];

      // 1. Attempt to delete all Storage objects first
      const failedPaths: string[] = [];
      const deletedPaths: string[] = [];

      for (const att of noteAtts) {
        const { error: storageErr } = await supabase.storage
          .from('health-policy-documents')
          .remove([att.storage_path]);

        if (storageErr) {
          console.error(`Failed to delete storage path: ${att.storage_path}`, storageErr);
          failedPaths.push(att.display_name);
        } else {
          deletedPaths.push(att.storage_path);
        }
      }

      // 2. If any storage deletion fails, stop and report error
      if (failedPaths.length > 0) {
        // Rollback or report
        throw new Error(`Storage deletion failed for attachment(s): ${failedPaths.join(', ')}. Note deletion aborted.`);
      }

      // 3. Delete the note (database cascade will clear note_attachments rows)
      const { error: dbErr } = await supabase
        .from('health_policy_notes')
        .delete()
        .eq('id', note.id);

      if (dbErr) throw dbErr;

      // Log in Timeline
      await supabase.from('client_timeline_events').insert({
        client_id: clientId,
        event_type: 'health_note_deleted',
        actor_id: session.user.id,
        details: {
          note_id: note.id,
          health_policy_id: healthPolicyId
        }
      });

      addToast({
        title: 'Note Deleted',
        description: 'The note and its attachments were removed successfully.',
        type: 'success'
      });

      loadNotesData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not delete the note.';
      addToast({
        title: 'Delete Failed',
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
        <form onSubmit={handleAddNote} className="space-y-4">
          <textarea
            value={noteContent}
            onChange={e => setNoteContent(e.target.value)}
            onPaste={handlePaste}
            placeholder="Type health policy notes here... (Press Ctrl+V to paste screenshot attachments directly)"
            className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all resize-none h-24"
          />

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {attachments.map(att => (
                <div key={att.id} className="relative w-16 h-16 border border-slate-200 rounded-lg overflow-hidden group shadow-sm bg-slate-50">
                  <img src={att.previewUrl} alt="pasted preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemovePendingAttachment(att.id)}
                    className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove Image"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/10"
            >
              Add Note
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        {notes.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 text-sm">
            No notes added yet for this health policy.
          </div>
        ) : (
          notes.map(note => {
            const isAuthor = currentUserId !== null && note.author_id === currentUserId;
            const authorName = note.profiles?.name || note.profiles?.email || 'Agent';
            const formattedDate = new Date(note.created_at).toLocaleString();
            const noteAtts = savedAttachments[note.id] || [];

            return (
              <div key={note.id} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <div>
                    <span className="font-extrabold text-slate-800 text-xs">{authorName}</span>
                    <span className="text-[10px] text-slate-400 ml-2">{formattedDate}</span>
                  </div>

                  {isAuthor && (
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(note)}
                      className="text-[10px] font-bold uppercase tracking-wider text-rose-500 hover:text-rose-700 px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 transition-all"
                    >
                      Delete
                    </button>
                  )}
                </div>

                <p className="text-slate-700 text-sm whitespace-pre-line leading-relaxed">
                  {note.content}
                </p>

                {noteAtts.length > 0 && (
                  <div className="flex flex-wrap gap-4 pt-2">
                    {noteAtts.map(att => {
                      const url = signedUrls[att.storage_path];
                      return (
                        <div key={att.id} className="space-y-1">
                          <div className="relative w-24 h-24 border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-slate-50">
                            {url ? (
                              <a href={url} target="_blank" rel="noreferrer">
                                <img src={url} alt={att.display_name} className="w-full h-full object-cover hover:scale-105 transition-transform cursor-zoom-in" />
                              </a>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-300 text-[10px]">
                                Loading...
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
