'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { isoDateToMMDDYYYY } from '@/lib/formatters/date';

export interface LifePolicyNote {
  id: string;
  life_policy_id: string;
  agent_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface LifePolicyNotesProps {
  lifePolicyId: string;
  onNotesChange?: () => void;
}

export default function LifePolicyNotes({ lifePolicyId, onNotesChange }: LifePolicyNotesProps) {
  const [notes, setNotes] = useState<LifePolicyNote[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [noteBody, setNoteBody] = useState<string>('');
  const [isPosting, setIsPosting] = useState<boolean>(false);
  const [postError, setPostError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('life_policy_notes')
        .select('*')
        .eq('life_policy_id', lifePolicyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (err) {
      console.error('Failed to load life policy notes:', err);
    } finally {
      setLoading(false);
    }
  }, [lifePolicyId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handlePostNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim()) return;

    setIsPosting(true);
    setPostError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error('Not authenticated.');

      const { error } = await supabase.from('life_policy_notes').insert({
        life_policy_id: lifePolicyId,
        agent_id: session.user.id,
        body: noteBody.trim(),
      });

      if (error) throw error;

      // Log timeline event
      await supabase.from('life_policy_timeline_events').insert({
        life_policy_id: lifePolicyId,
        title: 'Note Added',
        description: noteBody.trim().substring(0, 100),
        event_type: 'note_added',
      });

      setNoteBody('');
      await loadNotes();
      if (onNotesChange) onNotesChange();
    } catch (err: any) {
      console.error('Failed to post note:', err);
      setPostError(err.message || 'Failed to post note');
    } finally {
      setIsPosting(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    try {
      const { error } = await supabase.from('life_policy_notes').delete().eq('id', noteId);
      if (error) throw error;
      await loadNotes();
      if (onNotesChange) onNotesChange();
    } catch (err: any) {
      console.error('Failed to delete note:', err);
      alert('Failed to delete note: ' + err.message);
    }
  };

  return (
    <div className="space-y-3 font-sans">
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-sans">Policy Internal Notes</h4>
        <p className="text-[11px] text-slate-400 font-normal">Internal notes and logs scoped to this policy</p>
      </div>

      <form onSubmit={handlePostNote} className="space-y-2">
        {postError && (
          <div className="p-2 bg-rose-50 border border-rose-100 rounded-lg text-rose-600 text-xs font-semibold">
            {postError}
          </div>
        )}
        <textarea
          rows={3}
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          placeholder="Add a new note for this policy..."
          className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs font-normal"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPosting || !noteBody.trim()}
            className="text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-all shadow-xs disabled:opacity-50"
          >
            {isPosting ? 'Posting...' : 'Post Note'}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="py-6 text-center text-xs text-slate-400">Loading notes...</div>
      ) : notes.length === 0 ? (
        <div className="text-center py-6 bg-slate-50/50 border border-dashed border-slate-200 rounded-lg text-xs text-slate-400">
          No notes added to this policy yet.
        </div>
      ) : (
        <div className="space-y-2.5">
          {notes.map((n) => (
            <div key={n.id} className="p-3 bg-slate-50/80 border border-slate-200/80 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {isoDateToMMDDYYYY(n.created_at)}
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteNote(n.id)}
                  className="text-xs text-rose-600 hover:text-rose-800 font-bold"
                >
                  Delete
                </button>
              </div>
              <p className="text-xs text-slate-700 font-normal whitespace-pre-wrap">{n.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
