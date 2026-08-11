'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  NoteCategory,
  UnifiedNote,
  NoteAttachment,
  PendingAttachment,
  AssociatedPolicy
} from '@/lib/notes/types';
import {
  fetchClientNotes,
  fetchNoteAttachments,
  getAttachmentSignedUrl,
  createClientNote,
  updateClientNote,
  deleteClientNote,
  uploadNoteAttachments
} from '@/lib/notes/notes-service';

interface UnifiedNotesManagerProps {
  clientId: string;
  inferredCategory?: NoteCategory | null; // If null, central Client > Notes mode with filters & mandatory category selector
  policyId?: string | null; // If provided, locks creation to specific policy
  policiesList?: AssociatedPolicy[]; // Available policies for client dropdown
  currentUserId?: string | null;
  addToast?: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
}

export default function UnifiedNotesManager({
  clientId,
  inferredCategory = null,
  policyId = null,
  policiesList = [],
  currentUserId = null,
  addToast
}: UnifiedNotesManagerProps) {
  const [notes, setNotes] = useState<UnifiedNote[]>([]);
  const [attachmentsMap, setAttachmentsMap] = useState<{ [noteId: string]: NoteAttachment[] }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Central category filter state (used when inferredCategory is null)
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<NoteCategory | 'all'>('all');

  // Form composer state
  const [selectedCategory, setSelectedCategory] = useState<NoteCategory | ''>(
    inferredCategory || ''
  );
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(policyId || '');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [postingNote, setPostingNote] = useState(false);

  // Edit note state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [updatingNote, setUpdatingNote] = useState(false);

  // Menu state for 3-dot dropdowns
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync state if props change
  useEffect(() => {
    if (inferredCategory) {
      setSelectedCategory(inferredCategory);
    }
  }, [inferredCategory]);

  useEffect(() => {
    if (policyId) {
      setSelectedPolicyId(policyId);
    }
  }, [policyId]);

  // Load Notes & Attachments
  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const targetFilter = inferredCategory || (activeCategoryFilter === 'all' ? null : activeCategoryFilter);
      const fetchedNotes = await fetchClientNotes(clientId, targetFilter, policyId);
      setNotes(fetchedNotes);

      // Fetch attachments
      const noteIds = fetchedNotes.map(n => n.id);
      if (noteIds.length > 0) {
        const attMap = await fetchNoteAttachments(noteIds);
        setAttachmentsMap(attMap);

        // Fetch signed URLs for image attachments
        const updatedAttMap = { ...attMap };
        for (const nid of Object.keys(updatedAttMap)) {
          const atts = updatedAttMap[nid];
          for (let i = 0; i < atts.length; i++) {
            if (atts[i].mime_type.startsWith('image/')) {
              const signed = await getAttachmentSignedUrl(atts[i].storage_path);
              if (signed) atts[i].signedUrl = signed;
            }
          }
        }
        setAttachmentsMap(updatedAttMap);
      } else {
        setAttachmentsMap({});
      }
    } catch (err: any) {
      console.error('Error loading unified notes:', err);
      setError(err?.message || 'Failed to load notes.');
    } finally {
      setLoading(false);
    }
  }, [clientId, inferredCategory, activeCategoryFilter, policyId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Intercept paste event for Ctrl+V image attachments
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    const maxSize = 10 * 1024 * 1024; // 10 MB

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && allowedTypes.includes(item.type)) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        if (file.size > maxSize) {
          alert(`Image "${file.name}" exceeds 10 MB limit.`);
          continue;
        }

        const previewUrl = URL.createObjectURL(file);
        const ext = file.type.split('/')[1] || 'png';
        const displayName = `screenshot_${Date.now()}.${ext}`;

        setPendingAttachments(prev => [...prev, { file, previewUrl, displayName }]);
      }
    }
  }, []);

  // File browser attachment select
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const maxSize = 15 * 1024 * 1024; // 15 MB
    const newPending: PendingAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxSize) {
        alert(`File "${file.name}" exceeds 15 MB limit.`);
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      newPending.push({ file, previewUrl, displayName: file.name });
    }

    setPendingAttachments(prev => [...prev, ...newPending]);
    e.target.value = '';
  }, []);

  const removePendingAttachment = (index: number) => {
    setPendingAttachments(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].previewUrl);
      updated.splice(index, 1);
      return updated;
    });
  };

  // Submit note creation
  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = inferredCategory || selectedCategory;

    if (!finalCategory) {
      alert('Please select a category (Health, Life, or Property & Casualty).');
      return;
    }

    if (!newNoteContent.trim() && pendingAttachments.length === 0) {
      alert('Please enter note text or attach an image.');
      return;
    }

    try {
      setPostingNote(true);

      // 1. Create client note
      const newNote = await createClientNote({
        clientId,
        category: finalCategory,
        policyId: selectedPolicyId || null,
        content: newNoteContent,
        createdBy: currentUserId
      });

      // 2. Upload pending attachments
      if (pendingAttachments.length > 0) {
        await uploadNoteAttachments(newNote.id, clientId, currentUserId, pendingAttachments);
        pendingAttachments.forEach(p => URL.revokeObjectURL(p.previewUrl));
        setPendingAttachments([]);
      }

      setNewNoteContent('');
      if (!inferredCategory) setSelectedCategory('');
      if (!policyId) setSelectedPolicyId('');

      if (addToast) {
        addToast({ title: 'Success', description: 'Note created successfully.', type: 'success' });
      }

      await loadNotes();
    } catch (err: any) {
      console.error('Error creating note:', err);
      alert(err?.message || 'Failed to create note.');
    } finally {
      setPostingNote(false);
    }
  };

  // Edit Note submit
  const handleUpdateNoteSubmit = async (noteId: string) => {
    if (!editingContent.trim()) return;
    try {
      setUpdatingNote(true);
      await updateClientNote(noteId, editingContent);
      setEditingNoteId(null);
      setEditingContent('');

      if (addToast) {
        addToast({ title: 'Success', description: 'Note updated successfully.', type: 'success' });
      }
      await loadNotes();
    } catch (err: any) {
      console.error('Error updating note:', err);
      alert(err?.message || 'Failed to update note.');
    } finally {
      setUpdatingNote(false);
    }
  };

  // Delete Note submit
  const handleDeleteNoteSubmit = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note and all attached files?')) return;
    try {
      await deleteClientNote(noteId);
      if (addToast) {
        addToast({ title: 'Success', description: 'Note deleted.', type: 'success' });
      }
      await loadNotes();
    } catch (err: any) {
      console.error('Error deleting note:', err);
      alert(err?.message || 'Failed to delete note.');
    }
  };

  // Format category badge styling
  const renderCategoryBadge = (cat: NoteCategory) => {
    switch (cat) {
      case 'health':
        return <span className="px-2.5 py-1 text-xs font-extrabold rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wide">Health</span>;
      case 'life':
        return <span className="px-2.5 py-1 text-xs font-extrabold rounded-md bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wide">Life</span>;
      case 'property_casualty':
        return <span className="px-2.5 py-1 text-xs font-extrabold rounded-md bg-purple-100 text-purple-800 border border-purple-200 uppercase tracking-wide">Property & Casualty</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-extrabold rounded-md bg-slate-100 text-slate-700 uppercase tracking-wide">{cat}</span>;
    }
  };

  // Format date helper
  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 font-sans tracking-tight">Client Notes Center</h2>
          <p className="text-xs text-slate-500 font-medium">Unified single-record note feed across all policies and categories.</p>
        </div>

        {/* Category Filter Tabs (visible when in central Client > Notes mode) */}
        {!inferredCategory && (
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/80 gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeCategoryFilter === 'all'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Notes
            </button>
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('health')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeCategoryFilter === 'health'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-emerald-700'
              }`}
            >
              Health
            </button>
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('life')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeCategoryFilter === 'life'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-blue-700'
              }`}
            >
              Life
            </button>
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('property_casualty')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeCategoryFilter === 'property_casualty'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-purple-700'
              }`}
            >
              Property & Casualty
            </button>
          </div>
        )}
      </div>

      {/* Note Composer Form */}
      <form onSubmit={handleCreateNote} className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Category Selector (Mandatory if central view) */}
          {!inferredCategory && (
            <div className="w-full sm:w-1/2">
              <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value as NoteCategory)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              >
                <option value="">-- Select Category --</option>
                <option value="health">Health</option>
                <option value="life">Life</option>
                <option value="property_casualty">Property & Casualty</option>
              </select>
            </div>
          )}

          {/* Optional Policy Association Dropdown */}
          {!policyId && policiesList.length > 0 && (
            <div className={`w-full ${!inferredCategory ? 'sm:w-1/2' : 'sm:w-full'}`}>
              <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">
                Link to Policy (Optional)
              </label>
              <select
                value={selectedPolicyId}
                onChange={e => setSelectedPolicyId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">-- Client General Note --</option>
                {policiesList.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.policy_type || 'Policy'} {p.policy_number ? `(#${p.policy_number})` : ''} {p.writing_company || p.company_name ? `- ${p.writing_company || p.company_name}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Textarea Composer */}
        <div>
          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">
            Note Content (Ctrl+V to paste screenshot)
          </label>
          <textarea
            value={newNoteContent}
            onChange={e => setNewNoteContent(e.target.value)}
            onPaste={handlePaste}
            placeholder="Type note details here... You can paste screenshots directly with Ctrl+V"
            rows={3}
            className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-inner"
          />
        </div>

        {/* Pending Attachment Preview Queue */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-2">
            {pendingAttachments.map((att, idx) => (
              <div key={idx} className="relative group border border-slate-300 rounded-lg overflow-hidden bg-white shadow-sm w-24 h-24 flex flex-col justify-between p-1">
                {att.file.type.startsWith('image/') ? (
                  <img src={att.previewUrl} alt={att.displayName} className="w-full h-16 object-cover rounded" />
                ) : (
                  <div className="w-full h-16 flex items-center justify-center bg-slate-100 text-slate-500 text-xs font-bold">
                    FILE
                  </div>
                )}
                <div className="truncate text-[10px] text-slate-600 px-1 font-semibold">{att.displayName}</div>
                <button
                  type="button"
                  onClick={() => removePendingAttachment(idx)}
                  className="absolute top-1 right-1 bg-rose-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-black shadow hover:bg-rose-700"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Bottom Actions Bar */}
        <div className="flex items-center justify-between pt-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            className="hidden"
            accept="image/*,.pdf,.doc,.docx"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 px-3 py-2 rounded-lg transition"
          >
            📎 Attach Files
          </button>

          <button
            type="submit"
            disabled={postingNote}
            className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl transition shadow-md disabled:opacity-50"
          >
            {postingNote ? 'Posting Note...' : 'Post Note'}
          </button>
        </div>
      </form>

      {/* Error Message Display */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Notes List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <svg className="animate-spin h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <p className="text-sm font-bold text-slate-600">No notes found for this view.</p>
            <p className="text-xs text-slate-400 mt-1">Use the form above to add a new client note.</p>
          </div>
        ) : (
          notes.map(note => {
            const authorName = note.profiles?.name || note.profiles?.email || 'Agent';
            const noteAtts = attachmentsMap[note.id] || [];

            return (
              <div key={note.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3 relative group hover:border-slate-300 transition-all">
                {/* Top Row: Author, Timestamp, Category, Policy Badge, 3-Dot Menu */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-extrabold text-slate-900 font-sans">{authorName}</span>
                    <span className="text-xs font-semibold text-slate-400">•</span>
                    <span className="text-xs font-medium text-slate-500">{formatDate(note.created_at)}</span>
                    {renderCategoryBadge(note.category)}
                    {note.policies && (
                      <span className="px-2 py-0.5 text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-md">
                        {note.policies.policy_type || 'Policy'} {note.policies.policy_number ? `(#${note.policies.policy_number})` : ''}
                      </span>
                    )}
                  </div>

                  {/* 3-Dot Action Menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(openMenuId === note.id ? null : note.id)}
                      className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 font-bold"
                    >
                      •••
                    </button>
                    {openMenuId === note.id && (
                      <div className="absolute right-0 mt-1 w-32 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteId(note.id);
                            setEditingContent(note.content);
                            setOpenMenuId(null);
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          ✏️ Edit Note
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            handleDeleteNoteSubmit(note.id);
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"
                        >
                          🗑️ Delete Note
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Note Content / Edit Box */}
                {editingNoteId === note.id ? (
                  <div className="space-y-3 pt-2">
                    <textarea
                      value={editingContent}
                      onChange={e => setEditingContent(e.target.value)}
                      rows={3}
                      className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingNoteId(null)}
                        className="px-3 py-1.5 text-xs font-bold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateNoteSubmit(note.id)}
                        disabled={updatingNote}
                        className="px-4 py-1.5 text-xs font-extrabold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-800 font-normal leading-relaxed whitespace-pre-wrap">{note.content}</p>
                )}

                {/* Attachments Section */}
                {noteAtts.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">Attachments</div>
                    <div className="flex flex-wrap gap-3">
                      {noteAtts.map(att => (
                        <div key={att.id} className="border border-slate-200 rounded-lg p-2 bg-slate-50 hover:bg-slate-100 transition max-w-xs flex items-center gap-2">
                          {att.mime_type.startsWith('image/') && att.signedUrl ? (
                            <a href={att.signedUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2">
                              <img src={att.signedUrl} alt={att.display_name} className="w-10 h-10 object-cover rounded border border-slate-200" />
                              <span className="text-xs font-bold text-blue-600 hover:underline truncate">{att.display_name}</span>
                            </a>
                          ) : (
                            <a href={att.signedUrl || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-slate-200 rounded flex items-center justify-center text-slate-600 text-xs font-black">📄</div>
                              <span className="text-xs font-bold text-blue-600 hover:underline truncate">{att.display_name}</span>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
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
