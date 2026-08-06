'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import LifeProfileHeader from './LifeProfileHeader';
import LifePolicyCard, { LifePolicy } from './LifePolicyCard';

interface LifePolicyTabProps {
  clientId: string;
  onPoliciesChanged?: () => void;
}

export default function LifePolicyTab({ clientId, onPoliciesChanged }: LifePolicyTabProps) {
  const [policies, setPolicies] = useState<LifePolicy[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAdding, setIsAdding] = useState<boolean>(false);

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('life_policies')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPolicies(data || []);
    } catch (err) {
      console.error('Failed to load life policies:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const handleAddPolicy = async () => {
    setIsAdding(true);
    try {
      const { data, error } = await supabase
        .from('life_policies')
        .insert({
          client_id: clientId,
          status: 'Active',
        })
        .select('*')
        .single();

      if (error) throw error;

      // Create initial timeline event
      await supabase.from('life_policy_timeline_events').insert({
        life_policy_id: data.id,
        title: 'Life Policy Created',
        description: 'New Life Policy record initialized',
        event_type: 'policy_created',
      });

      await loadPolicies();
      if (onPoliciesChanged) onPoliciesChanged();
    } catch (err: any) {
      console.error('Failed to add life policy:', err);
      alert('Failed to add life policy: ' + err.message);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start font-sans">
      {/* Main Life Policies Content Area on the Left (flex-1) */}
      <main className="w-full flex-1 min-w-0 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 font-sans">Life Policies</h3>
            <p className="text-xs text-slate-500 font-normal">
              Manage life insurance policies, attached products, and beneficiaries for this client
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddPolicy}
            disabled={isAdding}
            className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 px-3 py-1.5 rounded-lg shadow-xs transition-all flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            {isAdding ? 'Creating Policy...' : '+ Add Another Policy'}
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading life policies...</div>
        ) : policies.length === 0 ? (
          <div className="text-center py-12 bg-white border border-dashed border-slate-200 rounded-xl p-6 space-y-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mx-auto">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h4 className="text-sm font-bold text-slate-800">No Life Policies Found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              This client does not have any Life Insurance policies recorded yet. Click below to add the first policy.
            </p>
            <button
              type="button"
              onClick={handleAddPolicy}
              disabled={isAdding}
              className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-all shadow-xs"
            >
              + Add First Life Policy
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {policies.map((p, idx) => (
              <LifePolicyCard
                key={p.id}
                policy={p}
                index={idx}
                onPolicyUpdated={() => {
                  loadPolicies();
                  if (onPoliciesChanged) onPoliciesChanged();
                }}
                onPolicyDeleted={() => {
                  loadPolicies();
                  if (onPoliciesChanged) onPoliciesChanged();
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Client Life Profile Side Panel on the Right (w-full lg:w-[300px]) */}
      <aside className="w-full lg:w-[300px] flex-shrink-0 lg:sticky lg:top-6">
        <LifeProfileHeader clientId={clientId} />
      </aside>
    </div>
  );
}
