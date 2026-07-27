'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Lead, LeadNote, LeadNoteAttachment, PastedImagePreview } from '@/lib/leads/types';
import { validateLeadFile, formatBytes, getLeadFileSignedUrl, logTimelineEvent } from '@/lib/leads/fileUtils';
import { extractUsDateAnd12hTime } from '@/utils/dateUtils';

interface LeadNotesTabProps {
  lead: Lead;
  onActivityLogged: () => void;
}

export default function LeadNotesTab({ lead, onActivityLogged }: LeadNotesTabProps) {
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Top-Level Note State
  const [newNoteBody, setNewNoteBody] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pastedPreviews, setPastedPreviews] = useState<PastedImagePreview[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Inline Reply State
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [submittingReply, setSubmittingReply] = useState(false);

  // Edit Note State
  const [editingNote, setEditingNote] = useState<LeadNote | null>(null);
  const [editBody, setEditBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete Note Confirmation State
  const [deletingNote, setDeletingNote] = useState<LeadNote | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load Notes & Attachments
  const loadNotesData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch all notes for this lead
      const { data: notesData, error: notesErr } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', lead.id)
        .eq('agent_id', user.id)
        .order('created_at', { ascending: true });

      if (notesErr) throw notesErr;

      // Fetch all attachments for this lead
      const { data: attachData, error: attachErr } = await supabase
        .from('lead_note_attachments')
        .select('*')
        .eq('lead_id', lead.id)
        .eq('agent_id', user.id);

      if (attachErr) throw attachErr;

      const attachmentsByNoteId: Record<string, LeadNoteAttachment[]> = {};
      (attachData || []).forEach((att) => {
        if (!attachmentsByNoteId[att.note_id]) {
          attachmentsByNoteId[att.note_id] = [];
        }
        attachmentsByNoteId[att.note_id].push(att);
      });

      // Construct cascading note tree (top-level and replies)
      const noteMap: Record<string, LeadNote> = {};
      const topLevelNotes: LeadNote[] = [];

      (notesData || []).forEach((rawNote) => {
        const fullNote: LeadNote = {
          ...rawNote,
          attachments: attachmentsByNoteId[rawNote.id] || [],
          replies: [],
        };
        noteMap[rawNote.id] = fullNote;
      });

      (notesData || []).forEach((rawNote) => {
        const item = noteMap[rawNote.id];
        if (rawNote.parent_note_id && noteMap[rawNote.parent_note_id]) {
          noteMap[rawNote.parent_note_id].replies?.push(item);
        } else {
          topLevelNotes.push(item);
        }
      });

      setNotes(topLevelNotes);
    } catch (err: any) {
      console.error('Error loading lead notes:', err);
      setError(err?.message || 'Failed to load notes.');
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => {
    loadNotesData();
  }, [loadNotesData]);

  // Handle Clipboard Paste for Screenshots
  const handlePaste = (e: React.ClipboardEvent, isReply: boolean = false) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const filesToAttach: File[] = [];
    const previewsToAttach: PastedImagePreview[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          const timestamp = Date.now();
          const ext = item.type.split('/')[1] || 'png';
          const file = new File([blob], `screenshot-${timestamp}.${ext}`, { type: item.type });
          
          const validationErr = validateLeadFile(file);
          if (validationErr) {
            setError(validationErr);
            return;
          }

          filesToAttach.push(file);
          previewsToAttach.push({
            id: `${timestamp}-${i}`,
            file,
            previewUrl: URL.createObjectURL(blob),
            filename: file.name,
          });
        }
      }
    }

    if (filesToAttach.length > 0) {
      if (isReply) {
        setReplyFiles((prev) => [...prev, ...filesToAttach]);
      } else {
        setSelectedFiles((prev) => [...prev, ...filesToAttach]);
        setPastedPreviews((prev) => [...prev, ...previewsToAttach]);
      }
    }
  };

  // Helper to upload files to Supabase Storage with Orphan Prevention
  const uploadFilesForNote = async (
    userId: string,
    noteId: string,
    filesToUpload: File[]
  ): Promise<void> => {
    for (const file of filesToUpload) {
      const validationErr = validateLeadFile(file);
      if (validationErr) throw new Error(validationErr);

      const storageFilename = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const storagePath = `${userId}/${lead.id}/notes/${noteId}/${storageFilename}`;

      // 1. Upload to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from('lead-files')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadErr) throw uploadErr;

      // 2. Insert metadata record with orphan cleanup on failure
      const { error: dbErr } = await supabase
        .from('lead_note_attachments')
        .insert({
          lead_id: lead.id,
          note_id: noteId,
          agent_id: userId,
          display_name: file.name,
          original_filename: file.name,
          storage_path: storagePath,
          mime_type: file.type || null,
          size_bytes: file.size,
        });

      if (dbErr) {
        // Orphan prevention cleanup
        await supabase.storage.from('lead-files').remove([storagePath]);
        throw dbErr;
      }

      // Log attachment timeline event
      await logTimelineEvent(
        lead.id,
        'note_attachment_added',
        `File "${file.name}" attached to note.`,
        { filename: file.name, size: file.size }
      );
    }
  };

  // Submit Top-Level Note
  const handleSaveTopLevelNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteBody.trim()) return;

    try {
      setSubmitting(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated.');

      // 1. Insert note record
      const { data: noteRow, error: noteErr } = await supabase
        .from('lead_notes')
        .insert({
          lead_id: lead.id,
          agent_id: user.id,
          parent_note_id: null,
          body: newNoteBody.trim(),
        })
        .select()
        .single();

      if (noteErr) throw noteErr;

      // 2. Upload attachments if present
      const allFilesToUpload = [...selectedFiles, ...pastedPreviews.map((p) => p.file)];
      if (allFilesToUpload.length > 0) {
        await uploadFilesForNote(user.id, noteRow.id, allFilesToUpload);
      }

      // 3. Log Timeline Event
      await logTimelineEvent(
        lead.id,
        'note_added',
        newNoteBody.trim().slice(0, 100)
      );

      // Reset form
      setNewNoteBody('');
      setSelectedFiles([]);
      setPastedPreviews([]);

      loadNotesData();
      onActivityLogged();
    } catch (err: any) {
      console.error('Error creating note:', err);
      setError(err?.message || 'Failed to create note.');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Reply
  const handleSaveReply = async (e: React.FormEvent, parentNoteId: string) => {
    e.preventDefault();
    if (!replyBody.trim()) return;

    try {
      setSubmittingReply(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated.');

      // 1. Insert reply note record
      const { data: replyRow, error: replyErr } = await supabase
        .from('lead_notes')
        .insert({
          lead_id: lead.id,
          agent_id: user.id,
          parent_note_id: parentNoteId,
          body: replyBody.trim(),
        })
        .select()
        .single();

      if (replyErr) throw replyErr;

      // 2. Upload reply attachments if present
      if (replyFiles.length > 0) {
        await uploadFilesForNote(user.id, replyRow.id, replyFiles);
      }

      // 3. Log Timeline Event
      await logTimelineEvent(
        lead.id,
        'note_added',
        replyBody.trim().slice(0, 100)
      );

      setReplyingToId(null);
      setReplyBody('');
      setReplyFiles([]);

      loadNotesData();
      onActivityLogged();
    } catch (err: any) {
      console.error('Error creating reply:', err);
      setError(err?.message || 'Failed to post reply.');
    } finally {
      setSubmittingReply(false);
    }
  };

  // Submit Edit Note
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote || !editBody.trim()) return;

    try {
      setSavingEdit(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error: editErr } = await supabase
        .from('lead_notes')
        .update({
          body: editBody.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingNote.id)
        .eq('agent_id', user.id);

      if (editErr) throw editErr;

      await logTimelineEvent(
        lead.id,
        'note_updated',
        editBody.trim().slice(0, 100)
      );

      setEditingNote(null);
      setEditBody('');

      loadNotesData();
      onActivityLogged();
    } catch (err: any) {
      console.error('Error updating note:', err);
      setError(err?.message || 'Failed to update note.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Collect all storage paths for a note and its child replies
  const collectStoragePaths = (targetNote: LeadNote): string[] => {
    let paths: string[] = (targetNote.attachments || []).map((a) => a.storage_path);
    (targetNote.replies || []).forEach((reply) => {
      paths = paths.concat(collectStoragePaths(reply));
    });
    return paths;
  };

  // Execute Delete Note with Step-by-Step Cleanup Order
  const handleDeleteNote = async () => {
    if (!deletingNote) return;

    try {
      setDeleting(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Collect all attachment storage paths for this note and any child replies
      const storagePaths = collectStoragePaths(deletingNote);

      // 2. Storage cleanup first
      if (storagePaths.length > 0) {
        const { error: storageErr } = await supabase.storage.from('lead-files').remove(storagePaths);
        if (storageErr) {
          throw new Error(`Storage file cleanup failed: ${storageErr.message}. Note row preserved.`);
        }
      }

      // 3. Database deletion only after storage cleanup succeeds
      const { error: delErr } = await supabase
        .from('lead_notes')
        .delete()
        .eq('id', deletingNote.id)
        .eq('agent_id', user.id);

      if (delErr) {
        throw new Error(`Inconsistency warning: Storage files removed but database note deletion failed: ${delErr.message}`);
      }

      await logTimelineEvent(
        lead.id,
        'note_deleted',
        `Deleted note: "${deletingNote.body.slice(0, 50)}..."`
      );

      setDeletingNote(null);
      loadNotesData();
      onActivityLogged();
    } catch (err: any) {
      console.error('Error deleting note:', err);
      setError(err?.message || 'Failed to delete note.');
    } finally {
      setDeleting(false);
    }
  };

  // Download signed file URL
  const handleDownloadAttachment = async (storagePath: string) => {
    const signedUrl = await getLeadFileSignedUrl(storagePath);
    if (signedUrl) {
      window.open(signedUrl, '_blank');
    } else {
      setError('Failed to generate download link for file.');
    }
  };

  // Delete Attachment from Note with Decoupled Cleanup Order
  const handleDeleteAttachment = async (attachment: LeadNoteAttachment) => {
    try {
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Remove storage object first
      const { error: storageErr } = await supabase.storage.from('lead-files').remove([attachment.storage_path]);
      if (storageErr) {
        throw new Error(`Storage file deletion failed: ${storageErr.message}. Attachment record preserved.`);
      }

      // 2. Remove DB record only after storage removal succeeds
      const { error: dbErr } = await supabase
        .from('lead_note_attachments')
        .delete()
        .eq('id', attachment.id)
        .eq('agent_id', user.id);

      if (dbErr) {
        throw new Error(`Inconsistency warning: Storage file deleted but attachment record removal failed: ${dbErr.message}`);
      }

      await logTimelineEvent(
        lead.id,
        'note_attachment_deleted',
        `File "${attachment.display_name}" deleted.`
      );

      loadNotesData();
      onActivityLogged();
    } catch (err: any) {
      console.error('Error deleting attachment:', err);
      setError(err?.message || 'Failed to delete attachment.');
    }
  };

  const formatNoteTimestamp = (isoStr: string) => {
    const { dateUs, hour12, minute, ampm } = extractUsDateAnd12hTime(isoStr);
    return `${dateUs} at ${hour12}:${minute} ${ampm}`;
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {error}
        </div>
      )}

      {/* TOP-LEVEL NOTE COMPOSER */}
      <form onSubmit={handleSaveTopLevelNote} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center justify-between">
          <span>Add Note</span>
          <span className="text-[11px] text-slate-500 font-normal">Tip: Paste screenshot directly into composer</span>
        </h3>

        <div className="relative">
          <textarea
            required
            rows={3}
            value={newNoteBody}
            onChange={(e) => setNewNoteBody(e.target.value)}
            onPaste={(e) => handlePaste(e, false)}
            placeholder="Type note details here... (Use Ctrl+V / Cmd+V to paste screenshots)"
            className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500/50 rounded-xl p-3.5 text-sm text-slate-100 outline-none resize-y min-h-[90px]"
          />
        </div>

        {/* Selected Files & Pasted Screenshots Previews */}
        {(selectedFiles.length > 0 || pastedPreviews.length > 0) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {selectedFiles.map((file, idx) => (
              <div key={idx} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 flex items-center gap-2">
                <span className="truncate max-w-[180px]">{file.name}</span>
                <span className="text-[10px] text-slate-500">({formatBytes(file.size)})</span>
                <button
                  type="button"
                  onClick={() => setSelectedFiles(selectedFiles.filter((_, i) => i !== idx))}
                  className="text-slate-400 hover:text-rose-400"
                >
                  ×
                </button>
              </div>
            ))}

            {pastedPreviews.map((p) => (
              <div key={p.id} className="relative bg-slate-950 border border-blue-500/40 rounded-xl p-1 flex items-center gap-2">
                <img src={p.previewUrl} alt="pasted screenshot" className="w-12 h-12 object-cover rounded-lg" />
                <div className="text-[11px] text-slate-300 pr-2">
                  <div className="font-semibold text-blue-400">Pasted Image</div>
                  <div className="text-[10px] text-slate-500">{formatBytes(p.file.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPastedPreviews(pastedPreviews.filter((item) => item.id !== p.id))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white text-xs flex items-center justify-center shadow"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-800/80 pt-3">
          <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            Attach Files
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  const newFiles = Array.from(e.target.files);
                  for (const f of newFiles) {
                    const err = validateLeadFile(f);
                    if (err) {
                      setError(err);
                      return;
                    }
                  }
                  setSelectedFiles((prev) => [...prev, ...newFiles]);
                }
              }}
            />
          </label>

          <button
            type="submit"
            disabled={submitting || !newNoteBody.trim()}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg transition-all disabled:opacity-50"
          >
            {submitting ? 'Saving Note...' : 'Save Note'}
          </button>
        </div>
      </form>

      {/* CASCADING NOTES TREE */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs bg-slate-900/60 border border-slate-800/80 rounded-2xl">
            Loading notes...
          </div>
        ) : notes.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs bg-slate-900/60 border border-slate-800/80 rounded-2xl">
            No notes recorded for this lead yet.
          </div>
        ) : (
          notes.map((note) => {
            const isEdited = note.updated_at !== note.created_at;
            return (
              <div key={note.id} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-3">
                {/* Note Header */}
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200 text-xs">Agent Note</span>
                    <span className="text-[11px] text-slate-500">{formatNoteTimestamp(note.created_at)}</span>
                    {isEdited && (
                      <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-medium">
                        Edited
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setReplyingToId(replyingToId === note.id ? null : note.id);
                        setReplyBody('');
                        setReplyFiles([]);
                      }}
                      className="text-xs text-blue-400 hover:underline font-medium"
                    >
                      Reply
                    </button>
                    <button
                      onClick={() => {
                        setEditingNote(note);
                        setEditBody(note.body);
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingNote(note)}
                      className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Note Body */}
                <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {note.body}
                </div>

                {/* Attachments List */}
                {note.attachments && note.attachments.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/60 space-y-1.5">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Attachments</span>
                    <div className="flex flex-wrap gap-2">
                      {note.attachments.map((att) => (
                        <div key={att.id} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownloadAttachment(att.storage_path)}
                            className="font-medium text-blue-400 hover:underline truncate max-w-[200px]"
                          >
                            {att.display_name}
                          </button>
                          <span className="text-[10px] text-slate-500">({formatBytes(att.size_bytes)})</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(att)}
                            className="text-slate-500 hover:text-rose-400 text-xs ml-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inline Reply Composer */}
                {replyingToId === note.id && (
                  <form onSubmit={(e) => handleSaveReply(e, note.id)} className="bg-slate-950 border border-slate-800 rounded-xl p-4 mt-3 space-y-3">
                    <h4 className="text-xs font-semibold text-blue-400">Reply to Note</h4>
                    <textarea
                      required
                      rows={2}
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      onPaste={(e) => handlePaste(e, true)}
                      placeholder="Write a reply..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 outline-none"
                    />

                    {replyFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {replyFiles.map((f, i) => (
                          <span key={i} className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                            {f.name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <label className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">
                        + Attach File
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files) {
                              setReplyFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                            }
                          }}
                        />
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setReplyingToId(null)}
                          className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={submittingReply}
                          className="px-3.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                        >
                          {submittingReply ? 'Posting...' : 'Post Reply'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* NESTED REPLIES */}
                {note.replies && note.replies.length > 0 && (
                  <div className="pl-4 sm:pl-6 border-l-2 border-slate-800 space-y-3 pt-3 mt-3">
                    {note.replies.map((reply) => (
                      <div key={reply.id} className="bg-slate-950/80 border border-slate-800/60 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-800/40 pb-1.5 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-300">Reply</span>
                            <span className="text-[10px] text-slate-500">{formatNoteTimestamp(reply.created_at)}</span>
                          </div>
                          <button
                            onClick={() => setDeletingNote(reply)}
                            className="text-[11px] text-rose-400 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                        <div className="text-xs text-slate-200 whitespace-pre-wrap">{reply.body}</div>

                        {reply.attachments && reply.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {reply.attachments.map((att) => (
                              <button
                                key={att.id}
                                onClick={() => handleDownloadAttachment(att.storage_path)}
                                className="text-[11px] bg-slate-900 border border-slate-800 hover:border-slate-700 text-blue-400 px-2 py-1 rounded"
                              >
                                {att.display_name} ({formatBytes(att.size_bytes)})
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* EDIT NOTE MODAL */}
      {editingNote && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-100">Edit Note</h3>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <textarea
                required
                rows={4}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 outline-none"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingNote(null)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  {savingEdit ? 'Updating...' : 'Update Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE NOTE CONFIRMATION MODAL */}
      {deletingNote && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-100">Delete Note</h3>
            <p className="text-sm text-slate-400">
              Are you sure you want to delete this note? Any nested replies and attached files will also be permanently deleted.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingNote(null)}
                className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteNote}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg"
              >
                {deleting ? 'Deleting...' : 'Delete Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
