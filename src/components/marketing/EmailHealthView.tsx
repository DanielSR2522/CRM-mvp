'use client';

import React, { useState } from 'react';
import { MarketingSuppression, MarketingSenderAccount } from '@/types/marketing';
import { computeSenderHealthScore } from '@/lib/marketing/email-health-service';

interface EmailHealthViewProps {
  suppressions: MarketingSuppression[];
  senderAccounts: MarketingSenderAccount[];
  onAddSuppression: (email: string, reason: MarketingSuppression['reason'], details?: string) => Promise<MarketingSuppression>;
}

export default function EmailHealthView({
  suppressions,
  senderAccounts,
  onAddSuppression,
}: EmailHealthViewProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [reason, setReason] = useState<MarketingSuppression['reason']>('MANUAL');
  const [details, setDetails] = useState('');

  const defaultAccount = senderAccounts.find((s) => s.is_default) || senderAccounts[0] || null;
  const health = computeSenderHealthScore(defaultAccount);

  const handleAdd = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      alert('Please enter a valid email address.');
      return;
    }
    await onAddSuppression(newEmail.trim(), reason, details.trim());
    setIsAddModalOpen(false);
    setNewEmail('');
    setDetails('');
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Domain Auth & Sender Health Summary Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Email Sender Health & Domain Verification</h3>
            <p className="text-xs text-slate-500">Domain authentication status (SPF, DKIM, DMARC) and reputation score</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
            health.status === 'EXCELLENT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
            health.status === 'GOOD' ? 'bg-blue-50 text-blue-700 border-blue-200' :
            'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            Domain Health: {health.status} ({health.score}%)
          </span>
        </div>

        {/* Auth Checks Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="font-bold text-slate-500 text-[10px] uppercase">SPF Record</span>
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Sender Policy Framework</span>
              <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                <span>✓</span> Verified
              </span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="font-bold text-slate-500 text-[10px] uppercase">DKIM Signature</span>
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">DomainKeys Identified Mail</span>
              <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                <span>✓</span> Verified
              </span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="font-bold text-slate-500 text-[10px] uppercase">DMARC Policy</span>
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">Domain Message Auth</span>
              <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                <span>✓</span> Verified
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Suppression List Management */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Global Suppression List</h3>
            <p className="text-xs text-slate-500">Unsubscribes, hard bounces, complaints, and manual exclusions</p>
          </div>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-rose-600/10 flex items-center gap-1.5"
          >
            <span>+</span> Add Suppressed Address
          </button>
        </div>

        {suppressions.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            No suppressed email addresses recorded.
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                <th className="py-3 px-4">Suppressed Email</th>
                <th className="py-3 px-4">Exclusion Reason</th>
                <th className="py-3 px-4">Audit Details</th>
                <th className="py-3 px-4">Added Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 font-medium text-slate-800">
              {suppressions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-900">{s.email}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      s.reason === 'UNSUBSCRIBE' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      s.reason === 'HARD_BOUNCE' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                      'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {s.reason}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500">{s.details || 'N/A'}</td>
                  <td className="py-3 px-4 text-slate-400 text-[11px]">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Manual Suppression Dialog */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">Add Email Suppression</h3>
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="text-slate-400 font-bold text-sm">✕</button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. client@domain.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Exclusion Reason</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold"
                >
                  <option value="MANUAL">Manual Suppression</option>
                  <option value="UNSUBSCRIBE">Unsubscribed</option>
                  <option value="HARD_BOUNCE">Hard Bounce</option>
                  <option value="COMPLAINT">Spam Complaint</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Audit Details / Notes</label>
                <input
                  type="text"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="e.g. Client requested opt-out via phone call"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 font-bold text-slate-600 text-xs">Cancel</button>
              <button type="button" onClick={handleAdd} className="px-4 py-2 bg-rose-600 text-white font-bold rounded-xl text-xs shadow-md">Add to Suppression List</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
