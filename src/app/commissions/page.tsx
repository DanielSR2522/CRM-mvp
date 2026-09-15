'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import UploadEvidenceModal from '@/components/commissions/UploadEvidenceModal';
import { CommissionPayment } from '@/types/commissions';

export default function CommissionsPage() {
  const [payments, setPayments] = useState<CommissionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [activeEvidenceUrl, setActiveEvidenceUrl] = useState<string | null>(null);

  const loadCommissions = () => {
    setLoading(true);
    fetch('/api/commissions/list')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setPayments(data.payments || []);
        }
      })
      .catch((err) => console.error('Failed to load commissions:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCommissions();
  }, []);

  const confirmedPayments = payments.filter((p) => p.status === 'PAID');
  const needsReviewPayments = payments.filter((p) => p.status === 'NEEDS_REVIEW' || p.status === 'PENDING');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">P&C Commissions</h1>
            <p className="text-xs text-slate-500 mt-1">
              Extract, match, and record P&C commission payments from evidence documents and screenshots.
            </p>
          </div>
          <button
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Upload Commission Evidence
          </button>
        </div>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Paid Commissions</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-2">
              ${confirmedPayments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0).toFixed(2)}
            </p>
            <p className="text-xs text-emerald-600 font-semibold mt-1">{confirmedPayments.length} recorded payments</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Needs Review</p>
            <p className="text-2xl font-extrabold text-amber-600 mt-2">{needsReviewPayments.length}</p>
            <p className="text-xs text-slate-500 mt-1">Pending policy association</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Activity</p>
            <p className="text-2xl font-extrabold text-slate-800 mt-2">{payments.length}</p>
            <p className="text-xs text-slate-500 mt-1">Total evidence processed</p>
          </div>
        </div>

        {/* Section 1: Recent Commission Payments */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">Recent Commission Payments</h2>
            <span className="text-xs font-semibold text-slate-500">{confirmedPayments.length} payments</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs font-semibold text-slate-500">Loading commission payments...</div>
          ) : confirmedPayments.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-bold text-slate-700">No confirmed commission payments yet</p>
              <p className="text-xs text-slate-500 mt-1">Upload a payment screenshot or document to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">Payment Date</th>
                    <th className="p-3.5">Client Name</th>
                    <th className="p-3.5">Policy Number</th>
                    <th className="p-3.5">Carrier</th>
                    <th className="p-3.5">Amount</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {confirmedPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-3.5 font-medium text-slate-900">{p.payment_date}</td>
                      <td className="p-3.5 font-semibold text-slate-900">{p.client_name || 'CRM Client'}</td>
                      <td className="p-3.5 font-mono text-slate-800">{p.policy_number}</td>
                      <td className="p-3.5 text-slate-700">{p.carrier}</td>
                      <td className="p-3.5 font-bold text-emerald-700">${Number(p.amount).toFixed(2)}</td>
                      <td className="p-3.5">
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold border border-emerald-200">
                          PAID ✓
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        {p.source_document_url ? (
                          <button
                            onClick={() => setActiveEvidenceUrl(p.source_document_url!)}
                            className="font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            View Evidence ↗
                          </button>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 2: Needs Review */}
        {needsReviewPayments.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-amber-200 bg-amber-100/50 flex items-center justify-between">
              <h2 className="text-base font-bold text-amber-900">Needs Review</h2>
              <span className="text-xs font-semibold text-amber-700">{needsReviewPayments.length} item(s)</span>
            </div>
            <div className="p-4 text-xs text-amber-800">
              The following payments require manual policy verification before financial records are updated.
            </div>
          </div>
        )}

        {/* Upload Modal */}
        <UploadEvidenceModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onSuccess={() => {
            loadCommissions();
          }}
        />

        {/* Evidence Viewer Modal */}
        {activeEvidenceUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-800">Commission Evidence Document</h3>
                <button
                  onClick={() => setActiveEvidenceUrl(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-lg"
                >
                  ✕
                </button>
              </div>
              <div className="max-h-[70vh] overflow-auto flex items-center justify-center border border-slate-200 rounded-lg p-2 bg-slate-50">
                {activeEvidenceUrl.toLowerCase().endsWith('.pdf') ? (
                  <iframe src={activeEvidenceUrl} className="w-full h-96 rounded-md" title="Evidence Document" />
                ) : (
                  <img src={activeEvidenceUrl} alt="Commission Evidence" className="max-h-[65vh] object-contain rounded-md" />
                )}
              </div>
              <div className="flex justify-end pt-2 border-t border-slate-200">
                <a
                  href={activeEvidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                >
                  Open in New Tab ↗
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
