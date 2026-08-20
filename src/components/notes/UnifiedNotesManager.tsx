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
  policyId?: string | null; // If provided, locks creation to specific P&C/Life/Supp policy
  healthPolicyId?: string | null; // If provided, locks creation to specific Health policy
  policiesList?: AssociatedPolicy[]; // Available policies for client dropdown
  currentUserId?: string | null;
  addToast?: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
}

export default function UnifiedNotesManager({
  clientId,
  inferredCategory = null,
  policyId = null,
  healthPolicyId = null,
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
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(policyId || healthPolicyId || '');
  const [noteTitle, setNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [postingNote, setPostingNote] = useState(false);
  const [deletingNoteTarget, setDeletingNoteTarget] = useState<string | null>(null);

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
    } else if (healthPolicyId) {
      setSelectedPolicyId(healthPolicyId);
    }
  }, [policyId, healthPolicyId]);

  // Filter policies dropdown based on selected category if in Client Notes mode
  const filteredPoliciesForDropdown = React.useMemo(() => {
    if (!selectedCategory) return policiesList;
    return policiesList.filter(p => {
      if (selectedCategory === 'health') return p.isHealth === true;
      if (p.isHealth === true) return false;
      if (!p.policy_type) return true;
      const typeLower = p.policy_type.toLowerCase();
      if (selectedCategory === 'life') return typeLower.includes('life');
      if (selectedCategory === 'supplemental') return typeLower.includes('supplemental') || typeLower.includes('accident') || typeLower.includes('critical');
      if (selectedCategory === 'medicare') return typeLower.includes('medicare') || typeLower.includes('part d') || typeLower.includes('advantage') || typeLower.includes('medigap') || typeLower.includes('part c');
      return true;
    });
  }, [selectedCategory, policiesList]);

  // Load Notes & Attachments
  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const targetFilter = inferredCategory || (activeCategoryFilter === 'all' ? null : activeCategoryFilter);
      const fetchedNotes = await fetchClientNotes(clientId, targetFilter, policyId, healthPolicyId);
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
              const url = await getAttachmentSignedUrl(atts[i].storage_path);
              if (url) atts[i].signedUrl = url;
            }
          }
        }
        setAttachmentsMap(updatedAttMap);
      }
    } catch (err: any) {
      console.error('Error loading notes:', err);
      setError(err?.message || 'Failed to load client notes.');
    } finally {
      setLoading(false);
    }
  }, [clientId, inferredCategory, activeCategoryFilter, policyId, healthPolicyId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Handle Clipboard Paste (Ctrl+V) for screenshots
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const previewUrl = URL.createObjectURL(file);
          const ext = file.type.split('/')[1] || 'png';
          const displayName = `Pasted_Screenshot_${Date.now()}.${ext}`;

          setPendingAttachments(prev => [
            ...prev,
            { file, previewUrl, displayName }
          ]);
        }
      }
    }
  }, []);

  // Handle File Input Select
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);

    const newPending: PendingAttachment[] = filesArray.map(file => ({
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      displayName: file.name
    }));

    setPendingAttachments(prev => [...prev, ...newPending]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingAttachment = (index: number) => {
    setPendingAttachments(prev => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Submit note creation
  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = inferredCategory || selectedCategory;

    if (!finalCategory) {
      alert('Please select a category (Health, Life, Medicare, Supplemental, or Property & Casualty).');
      return;
    }

    if (!newNoteContent.trim() && pendingAttachments.length === 0) {
      alert('Please enter note text or attach an image.');
      return;
    }

    try {
      setPostingNote(true);

      // Determine policy IDs
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

      // 1. Create client note
      const newNote = await createClientNote({
        clientId,
        category: finalCategory,
        policyId: targetPolicyId,
        healthPolicyId: targetHealthPolicyId,
        title: noteTitle.trim() || null,
        content: newNoteContent,
        createdBy: currentUserId
      });

      // 2. Upload pending attachments
      if (pendingAttachments.length > 0) {
        await uploadNoteAttachments(newNote.id, clientId, currentUserId, pendingAttachments);
        pendingAttachments.forEach(p => URL.revokeObjectURL(p.previewUrl));
        setPendingAttachments([]);
      }

      setNoteTitle('');
      setNewNoteContent('');
      if (!inferredCategory) setSelectedCategory('');
      if (!policyId && !healthPolicyId) setSelectedPolicyId('');

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
        addToast({ title: 'Success', description: 'Note deleted successfully.', type: 'success' });
      }
      await loadNotes();
    } catch (err: any) {
      console.error('Error deleting note:', err);
      alert(err?.message || 'Failed to delete note.');
    }
  };

  // Helper badge formatters
  const renderCategoryBadge = (cat: NoteCategory) => {
    switch (cat) {
      case 'health':
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">Health</span>;
      case 'life':
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 rounded-md">Life</span>;
      case 'medicare':
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-md">Medicare</span>;
      case 'supplemental':
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md">Supplemental</span>;
      case 'property_casualty':
      default:
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 rounded-md">Property & Casualty</span>;
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">
            {inferredCategory ? `${inferredCategory.toUpperCase().replace('_', ' & ')} NOTES` : 'CLIENT NOTES MANAGER'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {inferredCategory ? 'View and add notes for this module.' : 'Central workspace notes repository for all client modules.'}
          </p>
        </div>

        {/* Category Filters (Central View Mode) */}
        {!inferredCategory && (
          <div className="flex items-center gap-1.5 flex-wrap bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeCategoryFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
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
                Category / Module <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedCategory}
                onChange={e => {
                  setSelectedCategory(e.target.value as NoteCategory);
                  setSelectedPolicyId('');
                }}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              >
                <option value="">-- Select Module --</option>
                <option value="health">Health</option>
                <option value="life">Life</option>
                <option value="medicare">Medicare</option>
                <option value="supplemental">Supplemental</option>
                <option value="property_casualty">Property & Casualty</option>
              </select>
            </div>
          )}

          {/* Policy Association Dropdown */}
          {!policyId && !healthPolicyId && (
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
                {filteredPoliciesForDropdown.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.isHealth ? '[Health] ' : ''}{p.policy_type || 'Policy'} {p.policy_number ? `(#${p.policy_number})` : ''} {p.writing_company || p.company_name ? `- ${p.writing_company || p.company_name}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Optional Note Title */}
        <div>
          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">
            Note Title <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <input
            type="text"
            value={noteTitle}
            onChange={e => setNoteTitle(e.target.value)}
            placeholder="e.g. Policy Review Note"
            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none mb-3"
          />
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
            rows={3}
            placeholder="Write your note here... You can paste screenshots directly with Ctrl+V."
            className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs font-medium text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all resize-y"
          />
        </div>

        {/* Pending Image Previews */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-2">
            {pendingAttachments.map((att, idx) => (
              <div key={idx} className="relative group bg-white border border-slate-200 rounded-xl p-2 flex items-center gap-2 shadow-xs">
                {att.previewUrl ? (
                  <img src={att.previewUrl} alt="Preview" className="w-10 h-10 object-cover rounded-lg" />
                ) : (
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs font-bold">
                    FILE
                  </div>
                )}
                <span className="text-xs font-medium text-slate-700 max-w-[120px] truncate">{att.displayName}</span>
                <button
                  type="button"
                  onClick={() => removePendingAttachment(idx)}
                  className="text-rose-500 hover:text-rose-700 font-bold ml-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Form Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept="image/*,application/pdf"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 px-3 py-2 rounded-lg transition"
          >
            📎 Attach Files
          </button>

          <button
            type="button"
            onClick={handleCreateNote}
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
                    {note.policies ? (
                      <span className="px-2 py-0.5 text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-md flex items-center gap-1">
                        <span className="text-[10px] text-blue-600 uppercase font-extrabold font-mono">
                          {note.policies.isHealth ? 'Health Policy' : 'Policy'}
                        </span>
                        <span>
                          {note.policies.policy_type || 'Policy'} {note.policies.policy_number ? `(#${note.policies.policy_number})` : ''} {note.policies.company_name || note.policies.writing_company ? `- ${note.policies.company_name || note.policies.writing_company}` : ''}
                        </span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200 rounded-md">
                        General Note
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

                {/* Optional Note Title */}
                {note.title && (
                  <h4 className="text-sm font-extrabold text-slate-900">{note.title}</h4>
                )}

                {/* Content / Inline Edit Mode */}
                {editingNoteId === note.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={editingContent}
                      onChange={e => setEditingContent(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-50 border border-blue-500 rounded-xl p-3 text-xs font-medium text-slate-800 outline-none"
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingNoteId(null)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateNoteSubmit(note.id)}
                        disabled={updatingNote}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm"
                      >
                        {updatingNote ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-medium text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {note.content}
                  </p>
                )}

                {/* Attachments Display */}
                {noteAtts.length > 0 && (
                  <div className="pt-2 flex flex-wrap gap-3">
                    {noteAtts.map(att => (
                      <div key={att.id} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-3 shadow-xs">
                        {att.mime_type.startsWith('image/') && att.signedUrl ? (
                          <a href={att.signedUrl} target="_blank" rel="noopener noreferrer">
                            <img src={att.signedUrl} alt={att.display_name} className="w-12 h-12 object-cover rounded-lg hover:opacity-90" />
                          </a>
                        ) : (
                          <div className="w-10 h-10 bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center font-bold text-xs">
                            📄
                          </div>
                        )}
                        <div>
                          <span className="block text-xs font-bold text-slate-800 max-w-[160px] truncate" title={att.display_name}>
                            {att.display_name}
                          </span>
                          {att.signedUrl && (
                            <a
                              href={att.signedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-bold text-blue-600 hover:underline mt-0.5 inline-block"
                            >
                              View / Download
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
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
