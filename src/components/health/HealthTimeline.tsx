import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { formatDateTimeToUs } from '@/utils/dateUtils';

interface HealthTimelineProps {
  clientId: string;
  healthPolicyId: string;
  addToast: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  title: string;
  description: string;
  actor_name: string;
  created_at: string;
  dedup_key: string;
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

      const [activityRes, notesRes, docsRes, policyRes] = await Promise.all([
        // 1. Activity events logged specifically for this policy or client with health_policy_id
        supabase
          .from('activity_events')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),

        // 2. Direct health policy notes
        supabase
          .from('health_policy_notes')
          .select('id, content, created_at, author_id')
          .eq('health_policy_id', healthPolicyId)
          .order('created_at', { ascending: false }),

        // 3. Direct health policy documents
        supabase
          .from('health_policy_documents')
          .select('id, display_name, created_at, uploaded_by')
          .eq('health_policy_id', healthPolicyId)
          .order('created_at', { ascending: false }),

        // 4. Health policy row details
        supabase
          .from('health_policies')
          .select('id, created_at, updated_at, active, company_2026, plan_id, renovation_status')
          .eq('id', healthPolicyId)
          .maybeSingle()
      ]);

      const normalized: TimelineEvent[] = [];
      const seenKeys = new Set<string>();

      // A. Process activity_events
      if (activityRes.data) {
        activityRes.data.forEach((item: any) => {
          const isForThisPolicy = item.policy_id === healthPolicyId || item.metadata?.health_policy_id === healthPolicyId;
          const isHealthType = String(item.event_type).startsWith('health_');

          if (isForThisPolicy || isHealthType) {
            // Deduplicate
            const dedupKey = `activity_${item.id}`;
            if (!seenKeys.has(dedupKey)) {
              seenKeys.add(dedupKey);
              normalized.push({
                id: item.id,
                event_type: item.event_type || 'health_event',
                title: item.title || 'Health Policy Action',
                description: item.description || (item.metadata?.filename ? `Document: ${item.metadata.filename}` : 'Health activity recorded.'),
                actor_name: 'Agent',
                created_at: item.created_at,
                dedup_key: dedupKey
              });
            }
          }
        });
      }

      // B. Process health_policy_notes directly
      if (notesRes.data) {
        notesRes.data.forEach((note: any) => {
          const dedupKey = `note_${note.id}`;
          if (!seenKeys.has(dedupKey)) {
            seenKeys.add(dedupKey);
            const shortContent = note.content
              ? (note.content.length > 60 ? `${note.content.slice(0, 60)}...` : note.content)
              : 'Created health note';
            normalized.push({
              id: note.id,
              event_type: 'health_note_created',
              title: 'Health Note Created',
              description: `Note: "${shortContent}"`,
              actor_name: 'Agent',
              created_at: note.created_at,
              dedup_key: dedupKey
            });
          }
        });
      }

      // C. Process health_policy_documents directly
      if (docsRes.data) {
        docsRes.data.forEach((doc: any) => {
          const dedupKey = `doc_${doc.id}`;
          if (!seenKeys.has(dedupKey)) {
            seenKeys.add(dedupKey);
            normalized.push({
              id: doc.id,
              event_type: 'health_document_uploaded',
              title: 'Health Document Uploaded',
              description: `Uploaded "${doc.display_name}"`,
              actor_name: 'Agent',
              created_at: doc.created_at,
              dedup_key: dedupKey
            });
          }
        });
      }

      // D. Process policy creation/update timestamps
      if (policyRes.data) {
        const pol = policyRes.data;
        const createKey = `pol_create_${pol.id}`;
        if (!seenKeys.has(createKey) && pol.created_at) {
          seenKeys.add(createKey);
          normalized.push({
            id: createKey,
            event_type: 'health_policy_created',
            title: 'Health Policy Created',
            description: `Health policy registered${pol.company_2026 ? ` (${pol.company_2026})` : ''}.`,
            actor_name: 'Agent',
            created_at: pol.created_at,
            dedup_key: createKey
          });
        }

        if (pol.updated_at && pol.updated_at !== pol.created_at) {
          const updateKey = `pol_update_${pol.id}_${pol.updated_at.slice(0, 19)}`;
          if (!seenKeys.has(updateKey)) {
            seenKeys.add(updateKey);
            normalized.push({
              id: updateKey,
              event_type: 'health_policy_updated',
              title: 'Health Policy Updated',
              description: `Policy details updated (Status: ${pol.active ? 'Enrolled' : 'Inactive'}).`,
              actor_name: 'Agent',
              created_at: pol.updated_at,
              dedup_key: updateKey
            });
          }
        }
      }

      // Sort newest first
      normalized.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setEvents(normalized);
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
    loadTimelineEvents();
  }, [loadTimelineEvents]);

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
                <span className="text-slate-800 text-xs block font-bold">
                  {evt.title}
                </span>
                <p className="text-slate-600 text-xs block">
                  {evt.description}
                </p>
                <span className="text-[10px] text-slate-400 block">
                  {formatDateTimeToUs(evt.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
