'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { formatDateTimeMMDDYYYY } from '@/lib/formatters/date';

export interface ClientConsentHeaderControlProps {
  clientId: string;
  clientName: string;
  onSendConsent: () => void;
}

interface MiniConsentRow {
  id: string;
  title: string;
  status: string;
  selected_delivery_channel: string | null;
  created_at: string;
  sent_at: string | null;
  signed_at: string | null;
}

export default function ClientConsentHeaderControl({
  clientId,
  clientName,
  onSendConsent,
}: ClientConsentHeaderControlProps) {
  const [consents, setConsents] = useState<MiniConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const fetchConsents = async () => {
    if (!clientId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('signature_requests')
        .select('id, title, status, selected_delivery_channel, created_at, sent_at, signed_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConsents((data as MiniConsentRow[]) || []);
    } catch (err) {
      console.error('Error loading client header consents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsents();

    if (!clientId) return;

    const channel = supabase
      .channel(`header_control_${clientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'signature_requests',
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          fetchConsents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  // Click outside listener for dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const signedConsents = consents.filter((c) => c.status?.toLowerCase() === 'signed');
  const sentConsents = consents.filter((c) =>
    ['sent', 'viewed', 'pending'].includes(c.status?.toLowerCase())
  );
  const signedCount = signedConsents.length;
  const sentCount = sentConsents.length;
  const totalCount = consents.length;

  const getChannelDisplay = (ch: string | null) => {
    if (!ch) return 'Direct Link';
    if (ch === 'whatsapp') return 'WhatsApp';
    if (ch === 'email') return 'Email';
    if (ch === 'sms') return 'SMS';
    if (ch === 'copy_link') return 'Copy Link';
    return ch;
  };

  const getStatusBadge = (st: string) => {
    const lower = st?.toLowerCase();
    if (lower === 'signed') {
      return (
        <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
          ✓ Signed
        </span>
      );
    }
    if (lower === 'sent') {
      return (
        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200">
          Sent
        </span>
      );
    }
    if (lower === 'viewed') {
      return (
        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-purple-50 text-purple-700 border border-purple-200">
          Viewed
        </span>
      );
    }
    if (lower === 'declined') {
      return (
        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-50 text-rose-700 border border-rose-200">
          Declined
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-slate-100 text-slate-600 border border-slate-200 uppercase">
        {st}
      </span>
    );
  };

  return (
    <div className="relative inline-block font-sans" ref={dropdownRef}>
      {/* HEADER CONTROL BUTTON */}
      {signedCount > 0 ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3.5 py-1.5 text-xs font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
        >
          <span className="text-emerald-600">✓</span>
          <span>Signed Consents ({signedCount})</span>
          <span className="text-[10px] text-emerald-600">▼</span>
        </button>
      ) : totalCount > 0 ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3.5 py-1.5 text-xs font-extrabold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
        >
          <span>Consent Sent ({sentCount || totalCount})</span>
          <span className="text-[10px] text-blue-500">▼</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onSendConsent}
          className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
        >
          <span>📜</span>
          <span>+ Send Consent</span>
        </button>
      )}

      {/* COMPACT DROPDOWN HISTORY POPOVER */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 z-50 animate-fadeIn space-y-3 font-sans text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-1.5">
              {signedCount > 0 && <span className="text-emerald-600 font-bold">✓</span>}
              <h4 className="font-extrabold text-slate-900 text-xs tracking-tight">
                {signedCount > 0 ? `SIGNED CONSENTS (${signedCount})` : `CLIENT CONSENTS (${totalCount})`}
              </h4>
            </div>
            <span className="text-[10px] font-medium text-slate-400">
              {clientName}
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1">
            {consents.map((c) => (
              <div
                key={c.id}
                className="bg-slate-50/70 border border-slate-100 rounded-xl p-3 space-y-1.5 hover:border-blue-200 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-extrabold text-slate-900 leading-tight block text-xs">
                    {c.title || 'Consent Document'}
                  </span>
                  {getStatusBadge(c.status)}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                  <span>Channel: <strong className="text-slate-700">{getChannelDisplay(c.selected_delivery_channel)}</strong></span>
                </div>

                <div className="text-[10px] text-slate-400 space-y-0.5 border-t border-slate-100 pt-1 mt-1">
                  <div>Created: {formatDateTimeMMDDYYYY(c.created_at)}</div>
                  {c.sent_at && <div>Sent: {formatDateTimeMMDDYYYY(c.sent_at)}</div>}
                  {c.signed_at && <div className="text-emerald-700 font-bold">Signed: {formatDateTimeMMDDYYYY(c.signed_at)}</div>}
                </div>

                <div className="pt-1 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onSendConsent();
                    }}
                    className="text-[11px] font-bold text-blue-600 hover:underline"
                  >
                    View Consent →
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onSendConsent();
              }}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-xs text-center text-xs"
            >
              + Send New Consent
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
