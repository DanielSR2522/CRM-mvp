'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import { supabase } from '@/lib/supabaseClient';
import { LINES_OF_BUSINESS, COMMERCIAL_LINES_OF_BUSINESS, PERSONAL_LINES_OF_BUSINESS } from '@/constants/linesOfBusiness';
import { usDateToIso, formatAsDateInput } from '@/utils/dateUtils';
import DatePicker from '@/components/ui/DatePicker';

import { useBusinessLines } from '@/contexts/BusinessLinesContext';

export default function NewPolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const { isLineEnabled } = useBusinessLines();

  // States
  const [clientName, setClientName] = useState('');
  const [isCompanyClient, setIsCompanyClient] = useState(false);
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
  const [policyOwnershipType, setPolicyOwnershipType] = useState<'personal' | 'company'>('personal');

  // Policy Address States
  const [useAddressOnFile, setUseAddressOnFile] = useState(false);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [residenceInfo, setResidenceInfo] = useState<any>(null);
  const [noAddressMessage, setNoAddressMessage] = useState<string | null>(null);
  const [residenceError, setResidenceError] = useState<string | null>(null);

  useEffect(() => {
    const fetchClient = async () => {
      try {
        setLoading(true);
        const [clientRes, residenceRes] = await Promise.all([
          supabase.from('clients').select('full_name, client_type').eq('id', id).single(),
          supabase.from('client_residence_information').select('*').eq('client_id', id).maybeSingle(),
        ]);

        const clientData = clientRes.data;
        const residenceData = residenceRes.data || null;

        const isCompany = clientData?.client_type === 'company';

        setClientName(clientData?.full_name || '');
        setIsCompanyClient(isCompany);
        setPolicyOwnershipType(isCompany ? 'company' : 'personal');
        setResidenceInfo(residenceData);
      } catch (err: any) {
        console.error('Error fetching client details:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchClient();
  }, [id]);

  const handleUseAddressOnFileToggle = (checked: boolean) => {
    setUseAddressOnFile(checked);
    setNoAddressMessage(null);
    setResidenceError(null);

    if (checked) {
      if (!residenceInfo) {
        setNoAddressMessage('No residence address found on client file. Please enter address manually.');
        setUseAddressOnFile(false);
        return;
      }

      const resStreet = residenceInfo.street_address || residenceInfo.address || '';
      const resCity = residenceInfo.city || '';
      const resState = residenceInfo.state || '';
      const resZip = residenceInfo.zip_code || residenceInfo.zip || '';

      if (!resStreet && !resCity && !resState && !resZip) {
        setNoAddressMessage('Residence address on client file is empty. Please enter address manually.');
        setUseAddressOnFile(false);
        return;
      }

      setAddress(resStreet);
      setCity(resCity);
      setState(resState);
      setZipCode(resZip);
    }
  };

  if (!isLineEnabled('property_casualty')) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto py-12">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-8 text-center space-y-4 font-sans">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white">Module Access Restricted</h3>
            <p className="text-sm text-slate-300 max-w-md mx-auto">
              The <strong>Property & Casualty</strong> business line is currently disabled for your agent profile. You can enable it in Agent Information settings.
            </p>
            <div className="pt-2">
              <Link
                href="/personal-information"
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm transition-all"
              >
                Go to Agent Information
              </Link>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

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
      const premiumNum = totalPremium === '' ? 0 : Number(totalPremium);

      // Insert new policy record
      const { data, error } = await supabase
        .from('policies')
        .insert({
          client_id: id,
          policy_type: lob,
          transaction_type: 'New',
          policy_number: policyNumber.trim() || null,
          policy_payment_frequency: paymentFrequency,
          effective_date: effIso,
          expiration_date: expIso,
          billing_type: billingType,
          broker_name: brokerName.trim() || null,
          writing_company: writingCompany.trim() || null,
          company_name: writingCompany.trim() || null, // Keep synced with legacy column
          total_premium: premiumNum,
          premium: premiumNum, // Keep synced with legacy column
          annual_premium: premiumNum,
          status: policyStatus,
          policy_ownership_type: isCompanyClient ? 'company' : 'personal',
          address: address.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          zip_code: zipCode.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;

      // Log activity event & save linked companies if personal policy
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

  const availableLobs = [...(isCompanyClient ? COMMERCIAL_LINES_OF_BUSINESS : PERSONAL_LINES_OF_BUSINESS)].sort((a, b) => a.localeCompare(b));

  return (
    <DashboardLayout>
      <CrmPageContainer>
        
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
              <h3 className="text-lg font-extrabold text-slate-900">
                Add New {isCompanyClient ? 'Commercial Company' : 'Personal'} Policy
              </h3>
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

            <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
              
              {/* LEFT COLUMN */}
              <div className="space-y-4">
                {/* 1. Line of Business */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Line of Business</label>
                  <select
                    value={lob}
                    onChange={e => setLob(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                    required
                  >
                    <option value="">Select Option</option>
                    {availableLobs.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Company */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Company</label>
                  <input
                    type="text"
                    value={writingCompany}
                    onChange={e => setWritingCompany(e.target.value)}
                    placeholder="e.g. Progressive"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  />
                </div>

                {/* 3. Policy Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Policy Number</label>
                  <input
                    type="text"
                    value={policyNumber}
                    onChange={e => setPolicyNumber(e.target.value)}
                    placeholder="e.g. POL-123456"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  />
                </div>

                {/* 4. Effective Date */}
                <div>
                  <DatePicker
                    label="Effective Date"
                    required
                    value={effectiveDate}
                    onChange={(iso) => {
                      if (iso) {
                        const parts = iso.split('-');
                        setEffectiveDate(`${parts[1]}/${parts[2]}/${parts[0]}`);
                      } else {
                        setEffectiveDate('');
                      }
                    }}
                  />
                </div>

                {/* 5. Expiration Date */}
                <div>
                  <DatePicker
                    label="Expiration Date"
                    required
                    value={expirationDate}
                    onChange={(iso) => {
                      if (iso) {
                        const parts = iso.split('-');
                        setExpirationDate(`${parts[1]}/${parts[2]}/${parts[0]}`);
                      } else {
                        setExpirationDate('');
                      }
                    }}
                  />
                </div>

                {/* 6. Policy Address */}
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-slate-900">Policy Address</h4>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useAddressOnFile}
                        onChange={e => handleUseAddressOnFileToggle(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <span className="text-xs font-semibold text-slate-700">Use Address on File</span>
                    </label>
                  </div>

                  {noAddressMessage && (
                    <div className="p-3 mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold leading-relaxed">
                      {noAddressMessage}
                    </div>
                  )}

                  {residenceError && (
                    <div className="p-3 mb-4 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 text-xs leading-relaxed">
                      {residenceError}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Street Address</label>
                      <input
                        type="text"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        disabled={useAddressOnFile}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm disabled:opacity-60 disabled:cursor-not-allowed outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">City</label>
                      <input
                        type="text"
                        value={city}
                        onChange={e => setCity(e.target.value)}
                        disabled={useAddressOnFile}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm disabled:opacity-60 disabled:cursor-not-allowed outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">State</label>
                        <input
                          type="text"
                          value={state}
                          onChange={e => setState(e.target.value)}
                          disabled={useAddressOnFile}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm disabled:opacity-60 disabled:cursor-not-allowed outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ZIP Code</label>
                        <input
                          type="text"
                          value={zipCode}
                          onChange={e => setZipCode(e.target.value)}
                          disabled={useAddressOnFile}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm disabled:opacity-60 disabled:cursor-not-allowed outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="space-y-4">
                {/* 1. Policy Type (Read-Only) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Policy Type</label>
                  <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 text-sm font-semibold flex items-center justify-between cursor-not-allowed select-none">
                    <span>{isCompanyClient ? 'Company' : 'Personal'}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-200 text-slate-600">
                      Derived from Client Profile
                    </span>
                  </div>
                </div>

                {/* 2. Policy Status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Policy Status</label>
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

                {/* 3. Total Premium */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Total Premium</label>
                  <input
                    type="number"
                    value={totalPremium}
                    onChange={e => setTotalPremium(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 5000"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  />
                </div>

                {/* 4. Policy Payment Frequency */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Policy Payment Frequency</label>
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

                {/* 5. Billing Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Billing Type</label>
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

                {/* 6. Broker Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Broker Name</label>
                  <input
                    type="text"
                    value={brokerName}
                    onChange={e => setBrokerName(e.target.value)}
                    placeholder="e.g. John Agent"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  />
                </div>
              </div>
            </form>
          </div>
        )}
      </CrmPageContainer>
    </DashboardLayout>
  );
}
