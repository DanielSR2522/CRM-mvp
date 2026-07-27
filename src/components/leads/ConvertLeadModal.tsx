'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Lead, DuplicateClientCandidate } from '@/lib/leads/types';

interface ConvertLeadModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: (clientId: string) => void;
}

/**
 * Normalizes phone numbers to digits only.
 * Strips non-digits and optional US country code '1' if 11 digits long.
 * Returns empty string if no digits present.
 */
function normalizePhoneDigits(phoneStr: string | null | undefined): string {
  if (!phoneStr) return '';
  const digits = phoneStr.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

export default function ConvertLeadModal({ lead, onClose, onSuccess }: ConvertLeadModalProps) {
  const [duplicates, setDuplicates] = useState<DuplicateClientCandidate[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(true);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check existing clients for duplicate email/phone using normalized rules
  const checkDuplicates = useCallback(async () => {
    try {
      setCheckingDuplicates(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCheckingDuplicates(false);
        return;
      }

      const cleanLeadEmail = (lead.email || '').trim().toLowerCase();
      const cleanLeadPhoneDigits = normalizePhoneDigits(lead.phone);

      if (!cleanLeadEmail && !cleanLeadPhoneDigits) {
        setDuplicates([]);
        setCheckingDuplicates(false);
        return;
      }

      // Fetch all clients owned by authenticated agent
      const { data: allClients, error: fetchErr } = await supabase
        .from('clients')
        .select('id, full_name, email, phone, address')
        .eq('agent_id', user.id);

      if (fetchErr) throw fetchErr;

      if (allClients && allClients.length > 0) {
        const candidates: DuplicateClientCandidate[] = [];

        allClients.forEach((client) => {
          const clientEmail = (client.email || '').trim().toLowerCase();
          const clientPhoneDigits = normalizePhoneDigits(client.phone);

          const emailMatch = Boolean(cleanLeadEmail && clientEmail && clientEmail === cleanLeadEmail);
          const phoneMatch = Boolean(cleanLeadPhoneDigits && clientPhoneDigits && clientPhoneDigits === cleanLeadPhoneDigits);

          if (emailMatch || phoneMatch) {
            let matchedBy: 'email' | 'phone' | 'both' = 'email';
            if (emailMatch && phoneMatch) matchedBy = 'both';
            else if (phoneMatch) matchedBy = 'phone';

            candidates.push({
              id: client.id,
              full_name: client.full_name,
              email: client.email,
              phone: client.phone,
              address: client.address,
              matchedBy,
            });
          }
        });

        setDuplicates(candidates);
      } else {
        setDuplicates([]);
      }
    } catch (err: any) {
      console.error('Error checking duplicate clients:', err);
    } finally {
      setCheckingDuplicates(false);
    }
  }, [lead]);

  useEffect(() => {
    checkDuplicates();
  }, [checkDuplicates]);

  // Execute RPC conversion
  const handleExecuteConversion = async (existingClientId: string | null = null) => {
    try {
      setConverting(true);
      setError(null);

      const { data, error: rpcErr } = await supabase.rpc('convert_lead_to_client', {
        p_lead_id: lead.id,
        p_existing_client_id: existingClientId,
      });

      if (rpcErr) throw rpcErr;

      const newClientId = data as string;
      onSuccess(newClientId);
    } catch (err: any) {
      console.error('Error converting lead:', err);
      setError(err?.message || 'Failed to convert lead to client.');
    } finally {
      setConverting(false);
    }
  };

  const formattedAddress = [lead.address, lead.city, lead.state, lead.zip_code]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-green-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Convert Lead to Client</h2>
              <p className="text-xs text-slate-400">Permanently link prospect to client records</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-5 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {/* Lead Summary Card */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3 mb-5 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="font-semibold text-slate-200 text-sm">
              {lead.first_name} {lead.last_name}
            </span>
            <span className="text-slate-400 font-medium">{lead.product_interest || 'No Product Specified'}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-slate-300">
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Email</span>
              <span>{lead.email || 'N/A'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Phone</span>
              <span>{lead.phone || 'N/A'}</span>
            </div>
            <div className="col-span-2">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Address</span>
              <span>{formattedAddress || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Informational Warning */}
        <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center gap-3 mb-5">
          <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            This will create a new client record and permanently mark this lead as <strong>Converted</strong>.
          </span>
        </div>

        {/* Duplicate Detection Warning */}
        {checkingDuplicates ? (
          <div className="p-4 text-center text-xs text-slate-500">
            Checking for duplicate clients...
          </div>
        ) : duplicates.length > 0 ? (
          <div className="space-y-3 mb-6 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
              <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Potential Duplicate Client Match Found ({duplicates.length})</span>
            </div>

            <p className="text-xs text-amber-200/80">
              An existing client with matching email or phone was found in your account:
            </p>

            <div className="space-y-2">
              {duplicates.map((cand) => (
                <div key={cand.id} className="bg-slate-900 border border-amber-500/30 rounded-lg p-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-100">{cand.full_name}</div>
                    <div className="text-[11px] text-slate-400">
                      {cand.email && <span>{cand.email}</span>}
                      {cand.email && cand.phone && <span> • </span>}
                      {cand.phone && <span>{cand.phone}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/clients/${cand.id}`}
                      target="_blank"
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium"
                    >
                      View Profile
                    </Link>
                    <button
                      onClick={() => handleExecuteConversion(cand.id)}
                      disabled={converting}
                      className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-medium transition-colors disabled:opacity-50"
                    >
                      {converting ? 'Linking...' : 'Link to this Client'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => handleExecuteConversion(null)}
                disabled={converting}
                className="text-xs text-slate-300 underline hover:text-white font-medium"
              >
                Create New Client Anyway
              </button>
            </div>
          </div>
        ) : null}

        {/* Default Buttons (When no duplicates or explicit choice) */}
        {duplicates.length === 0 && !checkingDuplicates && (
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleExecuteConversion(null)}
              disabled={converting}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white text-xs font-semibold shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {converting ? 'Converting...' : 'Convert to Client'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
