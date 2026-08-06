'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { isoDateToMMDDYYYY } from '@/lib/formatters/date';

export interface LifePolicyTimelineEvent {
  id: string;
  life_policy_id: string;
  title: string;
  description: string | null;
  event_type: string;
  created_at: string;
}

interface LifePolicyTimelineProps {
  lifePolicyId: string;
}

export default function LifePolicyTimeline({ lifePolicyId }: LifePolicyTimelineProps) {
  const [events, setEvents] = useState<LifePolicyTimelineEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('life_policy_timeline_events')
        .select('*')
        .eq('life_policy_id', lifePolicyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (err) {
      console.error('Failed to load life policy timeline:', err);
    } finally {
      setLoading(false);
    }
  }, [lifePolicyId]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  return (
    <div className="space-y-3 font-sans">
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-sans">Policy Timeline</h4>
        <p className="text-[11px] text-slate-400 font-normal">
          Chronological activity history for this Life Policy
        </p>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-slate-400">Loading timeline...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-6 bg-slate-50/50 border border-dashed border-slate-200 rounded-lg text-xs text-slate-400">
          No timeline activity recorded yet.
        </div>
      ) : (
        <div className="relative border-l-2 border-slate-200 ml-3 pl-4 space-y-3">
          {events.map((evt) => (
            <div key={evt.id} className="relative group">
              <div className="absolute -left-[23px] top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-600 ring-4 ring-white" />
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-slate-900">{evt.title}</h5>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {isoDateToMMDDYYYY(evt.created_at)}
                  </span>
                </div>
                {evt.description && (
                  <p className="text-xs text-slate-600 font-normal">{evt.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
