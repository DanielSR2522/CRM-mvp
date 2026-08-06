'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { InlineEditableText } from '@/components/common/inline-edit';

export interface ClientLifeProfileData {
  id?: string;
  client_id: string;
  health_rating_approved: string | null;
  income: number | null;
  profits: number | null;
  company_name: string | null;
  owner_employee: string | null;
  net_worth: number | null;
}

interface LifeProfileHeaderProps {
  clientId: string;
}

export default function LifeProfileHeader({ clientId }: LifeProfileHeaderProps) {
  const [profile, setProfile] = useState<ClientLifeProfileData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingField, setSavingField] = useState<string | null>(null);

  const formatCurrency = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const parseCurrencyInput = (val: string): number => {
    const cleaned = val.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_life_profile')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      if (error) throw error;
      setProfile(data || {
        client_id: clientId,
        health_rating_approved: null,
        income: null,
        profits: null,
        company_name: null,
        owner_employee: null,
        net_worth: null,
      });
    } catch (err) {
      console.error('Failed to load client life profile:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSaveField = async (fieldName: keyof ClientLifeProfileData, rawValue: string) => {
    setSavingField(fieldName);
    try {
      let finalVal: any = rawValue.trim();

      if (['income', 'profits', 'net_worth'].includes(fieldName)) {
        finalVal = parseCurrencyInput(rawValue);
      }

      const payload: Partial<ClientLifeProfileData> = {
        client_id: clientId,
        [fieldName]: finalVal,
      };

      const { data, error } = await supabase
        .from('client_life_profile')
        .upsert(payload, { onConflict: 'client_id' })
        .select('*')
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (err: any) {
      console.error(`Failed to save ${fieldName}:`, err);
      alert(`Failed to save ${fieldName}: ${err.message || 'Error occurred'}`);
    } finally {
      setSavingField(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3 animate-pulse">
        <div className="h-4 w-32 bg-slate-200 rounded" />
        <div className="space-y-2">
          <div className="h-7 bg-slate-100 rounded" />
          <div className="h-7 bg-slate-100 rounded" />
          <div className="h-7 bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3 font-sans">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-sans">Client Life Profile</h3>
            <p className="text-[10px] text-slate-400 font-normal">Financial & Health Overview</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-0.5 text-xs font-sans">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Health Rating Approved</span>
          <InlineEditableText
            value={profile?.health_rating_approved || ''}
            placeholder="e.g. Preferred Plus"
            onSave={(val) => handleSaveField('health_rating_approved', val)}
            disabled={savingField === 'health_rating_approved'}
          />
        </div>

        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Income</span>
          <InlineEditableText
            value={profile?.income !== null && profile?.income !== undefined ? formatCurrency(profile.income) : ''}
            placeholder="$0.00"
            onSave={(val) => handleSaveField('income', val)}
            disabled={savingField === 'income'}
          />
        </div>

        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Profits</span>
          <InlineEditableText
            value={profile?.profits !== null && profile?.profits !== undefined ? formatCurrency(profile.profits) : ''}
            placeholder="$0.00"
            onSave={(val) => handleSaveField('profits', val)}
            disabled={savingField === 'profits'}
          />
        </div>

        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Company Name</span>
          <InlineEditableText
            value={profile?.company_name || ''}
            placeholder="Company Name"
            onSave={(val) => handleSaveField('company_name', val)}
            disabled={savingField === 'company_name'}
          />
        </div>

        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Owner / Employee</span>
          <InlineEditableText
            value={profile?.owner_employee || ''}
            placeholder="e.g. Owner"
            onSave={(val) => handleSaveField('owner_employee', val)}
            disabled={savingField === 'owner_employee'}
          />
        </div>

        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Net Worth</span>
          <InlineEditableText
            value={profile?.net_worth !== null && profile?.net_worth !== undefined ? formatCurrency(profile.net_worth) : ''}
            placeholder="$0.00"
            onSave={(val) => handleSaveField('net_worth', val)}
            disabled={savingField === 'net_worth'}
          />
        </div>
      </div>
    </div>
  );
}
