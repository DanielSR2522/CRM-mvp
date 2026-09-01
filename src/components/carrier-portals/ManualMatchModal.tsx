'use client';

import React, { useState, useEffect } from 'react';
import { formatDateMMDDYYYY } from '@/lib/carrier-portals/date-formatter';

interface ManualMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  carrierRecord: any | null;
}

export default function ManualMatchModal({
  isOpen,
  onClose,
  onSuccess,
  carrierRecord,
}: ManualMatchModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && carrierRecord) {
      setSearchTerm(carrierRecord.member_name || '');
      setSelectedClientId(carrierRecord.match?.client?.id || null);
      fetchClients(carrierRecord.member_name || '');
    }
  }, [isOpen, carrierRecord]);

  const fetchClients = async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients?search=${encodeURIComponent(query)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      } else {
        // Fallback to fetch clients list directly if needed
        const res2 = await fetch('/api/clients');
        if (res2.ok) {
          const data2 = await res2.json();
          const all = data2.clients || [];
          const filtered = all.filter((c: any) =>
            (c.full_name || '').toLowerCase().includes(query.toLowerCase()) ||
            (c.email || '').toLowerCase().includes(query.toLowerCase()) ||
            (c.phone || '').includes(query)
          );
          setClients(filtered.slice(0, 10));
        }
      }
    } catch (err: any) {
      console.error('Error searching clients:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !carrierRecord) return null;

  const handleConfirmMatch = async (clientId: string) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/carrier-portals/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_member_id: carrierRecord.external_member_id,
          client_id: clientId,
          action: 'confirm',
          carrier: carrierRecord.carrier || 'oscar',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update match.');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error confirming match:', err);
      setError(err?.message || 'Failed to link client.');
    } finally {
      setSaving(false);
    }
  };

  const handleIgnoreRecord = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/carrier-portals/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_member_id: carrierRecord.external_member_id,
          action: 'ignore',
          carrier: carrierRecord.carrier || 'oscar',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to ignore record.');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error ignoring record:', err);
      setError(err?.message || 'Failed to ignore record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-xl overflow-hidden font-sans">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Match Carrier Record to CRM Client</h3>
            <p className="text-xs text-slate-500 font-medium">Oscar Member ID: {carrierRecord.external_member_id}</p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Member Card */}
          <div className="p-4 rounded-xl bg-blue-50/40 border border-blue-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Oscar Member Info</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {carrierRecord.carrier_status?.toUpperCase()}
              </span>
            </div>
            <p className="text-sm font-extrabold text-slate-900">{carrierRecord.member_name}</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>
                <span className="text-slate-400 block text-[10px]">DOB:</span>
                <span className="font-semibold">{formatDateMMDDYYYY(carrierRecord.date_of_birth)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Email:</span>
                <span className="font-semibold truncate block">{carrierRecord.email || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Phone:</span>
                <span className="font-semibold">{carrierRecord.phone || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Plan:</span>
                <span className="font-semibold truncate block">{carrierRecord.plan || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Search Box */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Search CRM Client Database
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  fetchClients(e.target.value);
                }}
                placeholder="Type client name, email, or phone number..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all font-sans"
              />
              {loading && (
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 animate-spin">⌛</span>
              )}
            </div>
          </div>

          {/* Results List */}
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            <label className="text-[11px] font-bold text-slate-500 block">
              Matching Candidate Clients ({clients.length}):
            </label>
            {clients.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">
                No matching CRM clients found. Try refining search terms.
              </p>
            ) : (
              clients.map((c) => {
                const isSelected = selectedClientId === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedClientId(c.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-slate-900 truncate">{c.full_name}</p>
                      <p className="text-[11px] text-slate-500 font-sans truncate">
                        {c.email || 'No Email'} • {c.phone || 'No Phone'} • DOB: {c.date_of_birth || 'N/A'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConfirmMatch(c.id);
                      }}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-2xs shrink-0"
                    >
                      Confirm Match
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleIgnoreRecord}
            disabled={saving}
            className="px-3.5 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl transition-all"
          >
            Ignore Record
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl transition-all shadow-2xs"
            >
              Cancel
            </button>
            {selectedClientId && (
              <button
                type="button"
                onClick={() => handleConfirmMatch(selectedClientId)}
                disabled={saving}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/10"
              >
                {saving ? 'Saving...' : 'Confirm Selected Link'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
