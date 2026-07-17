import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface HealthTimelineProps {
  clientId: string;
  healthPolicyId: string;
  addToast: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
}

interface TimelineEventDetails {
  health_policy_id?: string;
  filename?: string;
  size_bytes?: number;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  actor_id: string;
  details: TimelineEventDetails | null;
  created_at: string;
  profiles?: {
    name: string | null;
    email: string | null;
  } | null;
}

export default function HealthTimeline({
  clientId,
  healthPolicyId,
  addToast
}: HealthTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTimelineEvents = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('client_timeline_events')
        .select('*, profiles(name, email)')
        .eq('client_id', clientId)
        .in('event_type', [
          'health_policy_created',
          'health_policy_updated',
          'health_document_uploaded',
          'health_document_deleted',
          'health_note_created',
          'health_note_deleted'
        ])
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter events belonging to this specific policyId if present in details
      const filtered = ((data as TimelineEvent[]) || []).filter(evt => {
        return evt.details?.health_policy_id === healthPolicyId;
      });

      setEvents(filtered);
    } catch (err) {
      console.error('Failed to load health timeline:', err);
      const message = err instanceof Error ? err.message : 'Could not load timeline events.';
      addToast({
        title: 'Timeline Error',
        description: message,
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [clientId, healthPolicyId, addToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTimelineEvents();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadTimelineEvents]);

  const getEventText = (evt: TimelineEvent): string => {
    const actor = evt.profiles?.name || evt.profiles?.email || 'Agent';
    const details = evt.details || {};

    switch (evt.event_type) {
      case 'health_policy_created':
        return `${actor} created the Health Policy.`;
      case 'health_policy_updated':
        return `${actor} updated the Health Policy details.`;
      case 'health_document_uploaded':
        return `${actor} uploaded document "${details.filename || 'file'}" to Health folder.`;
      case 'health_document_deleted':
        return `${actor} deleted document "${details.filename || 'file'}" from Health folder.`;
      case 'health_note_created':
        return `${actor} created a health note.`;
      case 'health_note_deleted':
        return `${actor} deleted a health note.`;
      default:
        return `${actor} performed health action: ${evt.event_type}.`;
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
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm font-sans">
      {events.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          No history events recorded yet for this health policy.
        </div>
      ) : (
        <div className="relative border-l border-slate-100 pl-6 ml-2 space-y-8 py-2">
          {events.map(evt => (
            <div key={evt.id} className="relative">
              {/* Dot icon */}
              <div className="absolute -left-[31px] top-1 bg-white border-2 border-blue-500 rounded-full w-4 h-4" />
              <div className="space-y-1">
                <span className="text-slate-700 text-sm block font-semibold">
                  {getEventText(evt)}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  {new Date(evt.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
