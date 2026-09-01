'use client';

import React, { useState, useMemo } from 'react';
import { formatDateMMDDYYYY } from '@/lib/carrier-portals/date-formatter';

interface PaymentsTabProps {
  records: any[];
  onOpenMatchModal: (record: any) => void;
}

export default function PaymentsTab({ records, onOpenMatchModal }: PaymentsTabProps) {
  const [carrierFilter, setCarrierFilter] = useState<string>('all');
  const [autopayFilter, setAutopayFilter] = useState<string>('all');

  // Filter records: STRICTLY ONLY SHOW RECORDS WHERE payment_due === true
  const paymentRecords = useMemo(() => {
    return records.filter((rec) => {
      // Must be payment_due === true
      if (!rec.payment_due) return false;

      // Carrier filter
      if (carrierFilter !== 'all' && rec.carrier?.toLowerCase() !== carrierFilter.toLowerCase()) {
        return false;
      }

      // Autopay filter (strictly separate not_enrolled from unknown)
      if (autopayFilter === 'enrolled' && rec.autopay_status !== 'enrolled') return false;
      if (autopayFilter === 'not_enrolled' && rec.autopay_status !== 'not_enrolled') return false;
      if (autopayFilter === 'unknown' && rec.autopay_status !== 'unknown') return false;

      return true;
    });
  }, [records, carrierFilter, autopayFilter]);

  const totalBalanceDue = useMemo(() => {
    return paymentRecords.reduce((sum, r) => sum + Number(r.amount_due || 0), 0);
  }, [paymentRecords]);

  const notOnAutopayCount = useMemo(() => {
    return records.filter((r) => r.autopay_status === 'not_enrolled').length;
  }, [records]);

  return (
    <div className="space-y-6 font-sans">
      {/* Controls & Summary Bar */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Carrier Filter */}
          <select
            value={carrierFilter}
            onChange={(e) => setCarrierFilter(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">All Carriers</option>
            <option value="oscar">Oscar Health</option>
            <option value="ambetter">Ambetter</option>
            <option value="molina">Molina Healthcare</option>
            <option value="florida_blue">Florida Blue</option>
          </select>

          {/* Autopay Filter */}
          <select
            value={autopayFilter}
            onChange={(e) => setAutopayFilter(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">All AutoPay Statuses</option>
            <option value="enrolled">Enrolled</option>
            <option value="not_enrolled">Not Enrolled ({notOnAutopayCount})</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-amber-50 border border-amber-100 rounded-xl text-right shrink-0">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Not On AutoPay (Action Req.)</span>
            <span className="text-lg font-black text-amber-900">{notOnAutopayCount} Clients</span>
          </div>

          <div className="px-4 py-2 bg-rose-50 border border-rose-100 rounded-xl text-right shrink-0">
            <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block">Total Outstanding Balance</span>
            <span className="text-lg font-black text-rose-600">
              ${totalBalanceDue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Main Payments Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
        {paymentRecords.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-bold text-slate-700">✓ No payment-due policies found for current filter selection.</p>
            <p className="text-xs text-slate-400">All member policies match expected payment status.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Carrier</th>
                  <th className="py-3.5 px-4">Client / Member</th>
                  <th className="py-3.5 px-4">Policy Number</th>
                  <th className="py-3.5 px-4">Payment Status</th>
                  <th className="py-3.5 px-4">Paid Through Date</th>
                  <th className="py-3.5 px-4">Amount Due</th>
                  <th className="py-3.5 px-4">AutoPay</th>
                  <th className="py-3.5 px-4">Last Payment Date</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paymentRecords.map((rec) => {
                  const statusLabel = rec.payment_status_label || (rec.carrier_status === 'grace_period' ? 'Grace Period' : 'Payment Due');
                  const isGrace = statusLabel === 'Grace Period' || statusLabel === 'Delinquent';

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Carrier */}
                      <td className="py-3.5 px-4">
                        <span className="font-extrabold text-slate-800 uppercase px-2 py-0.5 rounded bg-slate-100 border border-slate-200/60 text-[10px]">
                          {rec.carrier || 'Carrier'}
                        </span>
                      </td>

                      {/* Client / Member */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-900 text-sm">
                          {rec.member_name || 'Unnamed Member'}
                        </div>
                      </td>

                      {/* Policy Number */}
                      <td className="py-3.5 px-4">
                        <span className="text-[11px] font-mono text-slate-600 font-bold">
                          {rec.external_member_id}
                        </span>
                      </td>

                      {/* Payment Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                            isGrace
                              ? 'bg-amber-50 text-amber-800 border-amber-300 font-black animate-pulse'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </td>

                      {/* Paid Through Date */}
                      <td className="py-3.5 px-4 text-[11px] font-medium text-slate-700 whitespace-nowrap">
                        {rec.paid_through_date ? formatDateMMDDYYYY(rec.paid_through_date) : 'Unavailable'}
                      </td>

                      {/* Amount Due */}
                      <td className="py-3.5 px-4 font-black text-rose-600 text-sm">
                        {rec.amount_due_formatted || 'Unavailable'}
                      </td>

                      {/* AutoPay */}
                      <td className="py-3.5 px-4 text-xs font-bold">
                        {rec.autopay_status === 'enrolled' ? (
                          <span className="text-emerald-700 font-extrabold px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-md">Enrolled</span>
                        ) : rec.autopay_status === 'not_enrolled' ? (
                          <span className="text-rose-600 font-black px-2 py-0.5 bg-rose-50 border border-rose-200 rounded-md">Not Enrolled</span>
                        ) : (
                          <span className="text-slate-500 font-medium px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md">Unknown</span>
                        )}
                      </td>

                      {/* Last Payment Date */}
                      <td className="py-3.5 px-4 text-[11px] font-medium text-slate-600 whitespace-nowrap">
                        {rec.last_payment_date ? formatDateMMDDYYYY(rec.last_payment_date) : 'Unavailable'}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => onOpenMatchModal(rec)}
                          className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-extrabold text-[11px] transition-colors"
                        >
                          Match Client
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
