'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Lead, LeadTimelineEvent } from '@/lib/leads/types';
import { extractUsDateAnd12hTime } from '@/utils/dateUtils';

interface LeadTimelineTabProps {
  lead: Lead;
}

export default function LeadTimelineTab({ lead }: LeadTimelineTabProps) {
  const [events, setEvents] = useState<LeadTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTimelineEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error: fetchErr } = await supabase
        .from('lead_timeline_events')
        .select('*')
        .eq('lead_id', lead.id)
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      setEvents(data || []);
    } catch (err: any) {
      console.error('Error loading timeline events:', err);
      setError(err?.message || 'Failed to load activity timeline.');
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => {
    loadTimelineEvents();
  }, [loadTimelineEvents]);

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'lead_created':
        return (
          <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
        );
      case 'lead_converted':
        return (
          <div className="w-8 h-8 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'status_changed':
        return (
          <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
        );
      case 'note_added':
      case 'note_updated':
        return (
          <div className="w-8 h-8 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
        );
      case 'document_uploaded':
      case 'note_attachment_added':
        return (
          <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </div>
        );
      case 'note_deleted':
      case 'document_deleted':
      case 'note_attachment_deleted':
        return (
          <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
    }
  };

  const formatTimestamp = (isoStr: string) => {
    const { dateUs, hour12, minute, ampm } = extractUsDateAnd12hTime(isoStr);
    return `${dateUs} at ${hour12}:${minute} ${ampm}`;
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="border-b border-slate-800/80 pb-4">
        <h3 className="text-sm font-bold text-slate-100">Activity Timeline</h3>
        <p className="text-xs text-slate-400 mt-0.5">Audit log of all lead events and interactions</p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-slate-500 text-xs">
          Loading activity timeline...
        </div>
      ) : events.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-xs">
          No activity recorded yet.
        </div>
      ) : (
        <div className="relative border-l-2 border-slate-800 ml-4 space-y-6">
          {events.map((evt) => (
            <div key={evt.id} className="relative pl-6">
              {/* Event Icon Pin */}
              <div className="absolute -left-4 top-0">
                {getEventIcon(evt.event_type)}
              </div>

              {/* Event Card */}
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-xs">{evt.title}</span>
                  <span className="text-[11px] text-slate-500 font-medium">{formatTimestamp(evt.created_at)}</span>
                </div>

                {evt.description && (
                  <p className="text-xs text-slate-400 leading-relaxed pt-0.5">{evt.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
