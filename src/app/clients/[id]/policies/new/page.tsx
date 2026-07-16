'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import { LINES_OF_BUSINESS } from '@/constants/linesOfBusiness';
import { usDateToIso, formatAsDateInput } from '@/utils/dateUtils';

export default function NewPolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  // States
  const [clientName, setClientName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Field States
  const [lob, setLob] = useState('');
  const [transactionType, setTransactionType] = useState<'New Business' | 'Renewal'>('New Business');
  const [policyNumber, setPolicyNumber] = useState('');
  const [paymentFrequency, setPaymentFrequency] = useState<'Annual' | 'Monthly'>('Annual');
  const [effectiveDate, setEffectiveDate] = useState(''); // MM/DD/YYYY
  const [expirationDate, setExpirationDate] = useState(''); // MM/DD/YYYY
  const [billingType, setBillingType] = useState<'Direct Bill' | 'Agency Bill'>('Direct Bill');
  const [brokerName, setBrokerName] = useState('');
  const [writingCompany, setWritingCompany] = useState('');
  const [totalPremium, setTotalPremium] = useState<number | ''>('');
  const [annualPremium, setAnnualPremium] = useState<number | ''>('');
  const [policyStatus, setPolicyStatus] = useState<'Active' | 'Cancelled' | 'Expired' | 'Pending'>('Active');

  useEffect(() => {
    const fetchClient = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('clients')
          .select('full_name')
          .eq('id', id)
          .single();
        if (error) throw error;
        setClientName(data?.full_name || '');
      } catch (err: any) {
        console.error('Error fetching client name:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchClient();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!effectiveDate || !expirationDate) {
      setErrorMsg('Both Effective Date and Expiration Date are required.');
      return;
    }

    const effIso = usDateToIso(effectiveDate);
    const expIso = usDateToIso(expirationDate);

    if (!effIso || !expIso) {
      setErrorMsg('Dates must be in MM/DD/YYYY format.');
      return;
    }

    const d1 = new Date(effIso + 'T00:00:00');
    const d2 = new Date(expIso + 'T00:00:00');
    if (d2 < d1) {
      setErrorMsg('Expiration Date cannot be earlier than Effective Date.');
      return;
    }

    if (!lob) {
      setErrorMsg('Line of Business is required.');
      return;
    }

    setSaving(true);

    try {
      // Insert new policy record
      const { data, error } = await supabase
        .from('policies')
        .insert({
          client_id: id,
          policy_type: lob,
          transaction_type: transactionType === 'New Business' ? 'New' : 'Renewal',
          policy_number: policyNumber.trim() || null,
          policy_payment_frequency: paymentFrequency,
          effective_date: effIso,
          expiration_date: expIso,
          billing_type: billingType,
          broker_name: brokerName.trim() || null,
          writing_company: writingCompany.trim() || null,
          company_name: writingCompany.trim() || null, // Keep synced with legacy column
          total_premium: totalPremium === '' ? 0 : Number(totalPremium),
          premium: totalPremium === '' ? 0 : Number(totalPremium), // Keep synced with legacy column
          annual_premium: annualPremium === '' ? 0 : Number(annualPremium),
          status: policyStatus,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;

      // Log activity event (non-blocking)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          await supabase.from('activity_events').insert({
            client_id: id,
            policy_id: data.id,
            actor_id: session.user.id,
            event_type: 'policy_created',
            title: 'Policy created',
            description: `Policy ${lob} (${policyNumber || 'Not specified'}) was created.`,
            metadata: {
              policy_number: policyNumber || null,
              line_of_business: lob || null
            }
          });
        }
      } catch (errEvent) {
        console.error('Failed to log policy creation event:', errEvent);
      }

      // Navigate to the newly created policy profile page
      router.push(`/clients/${id}/policies/${data.id}`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create policy.');
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/clients" className="hover:text-blue-600 transition-colors">Clients</Link>
          <span>/</span>
          <Link href={`/clients/${id}`} className="hover:text-blue-600 transition-colors font-medium">
            {clientName || 'Client Profile'}
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">New Policy</span>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
              <h3 className="text-lg font-extrabold text-slate-900">Add New Policy</h3>
              <div className="flex items-center gap-2">
                <Link
                  href={`/clients/${id}`}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg transition-all"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-all shadow-md disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Policy'}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              
              {/* LEFT COLUMN */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Line of Business</label>
                  <select
                    value={lob}
                    onChange={e => setLob(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                    required
                  >
                    <option value="">Select Option</option>
                    {LINES_OF_BUSINESS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Transaction Type</label>
                  <select
                    value={transactionType}
                    onChange={e => setTransactionType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                    required
                  >
                    <option value="New Business">New Business</option>
                    <option value="Renewal">Renewal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Policy Number</label>
                  <input
                    type="text"
                    value={policyNumber}
                    onChange={e => setPolicyNumber(e.target.value)}
                    placeholder="e.g. POL-123456"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Policy Payment Frequency</label>
                  <select
                    value={paymentFrequency}
                    onChange={e => setPaymentFrequency(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                    required
                  >
                    <option value="Annual">Annual</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Effective Date</label>
                  <input
                    type="text"
                    value={effectiveDate}
                    onChange={e => setEffectiveDate(formatAsDateInput(e.target.value))}
                    placeholder="MM/DD/YYYY"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Expiration Date</label>
                  <input
                    type="text"
                    value={expirationDate}
                    onChange={e => setExpirationDate(formatAsDateInput(e.target.value))}
                    placeholder="MM/DD/YYYY"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Billing Type</label>
                  <select
                    value={billingType}
                    onChange={e => setBillingType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                    required
                  >
                    <option value="Direct Bill">Direct Bill</option>
                    <option value="Agency Bill">Agency Bill</option>
                  </select>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Broker Name</label>
                  <input
                    type="text"
                    value={brokerName}
                    onChange={e => setBrokerName(e.target.value)}
                    placeholder="e.g. John Agent"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Writing Company</label>
                  <input
                    type="text"
                    value={writingCompany}
                    onChange={e => setWritingCompany(e.target.value)}
                    placeholder="e.g. Progressive"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-850 placeholder-slate-400 text-sm outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Total Premium</label>
                  <input
                    type="number"
                    value={totalPremium}
                    onChange={e => setTotalPremium(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 5000"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Annual Premium</label>
                  <input
                    type="number"
                    value={annualPremium}
                    onChange={e => setAnnualPremium(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 5000"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Policy Status</label>
                  <select
                    value={policyStatus}
                    onChange={e => setPolicyStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                    required
                  >
                    <option value="Active">Active</option>
                    <option value="Cancelled">Cancelled</option>
                    <option value="Expired">Expired</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
