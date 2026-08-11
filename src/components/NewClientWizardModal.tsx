'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import PhoneInput from '@/components/common/PhoneInput';
import GoogleAddressAutocomplete, { NormalizedAddress } from '@/components/address/GoogleAddressAutocomplete';
import { parseDisplayDate } from '@/utils/dateUtils';

interface NewClientWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
}

export type PolicyType = 'property_casualty' | 'health' | 'life';
export type PcClientType = 'individual' | 'company';
export type HealthEnrollmentType = 'new_enrollment' | 'renewal';
export type LifeProductType = 'Term' | 'IUL' | 'Whole Life' | 'VUL' | 'Term - Disability' | 'Costumer Whole Life';

export default function NewClientWizardModal({
  isOpen,
  onClose,
  currentUserId
}: NewClientWizardModalProps) {
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Selections
  const [policyType, setPolicyType] = useState<PolicyType | ''>('');
  const [pcClientType, setPcClientType] = useState<PcClientType | ''>('');
  const [healthEnrollmentType, setHealthEnrollmentType] = useState<HealthEnrollmentType | ''>('');
  const [lifeProductType, setLifeProductType] = useState<LifeProductType | ''>('');

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [assignedAgentId, setAssignedAgentId] = useState(currentUserId || '');

  // Agents dropdown options
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [personalClientsList, setPersonalClientsList] = useState<{ id: string; full_name: string; email?: string; phone?: string; address?: string }[]>([]);
  const [selectedContactClientId, setSelectedContactClientId] = useState<string>('');

  // UI state
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load agents list for agent assignment dropdown & personal clients for contact selector
  useEffect(() => {
    async function loadData() {
      if (!isOpen) return;
      try {
        const [agentsRes, clientsRes] = await Promise.all([
          supabase.from('profiles').select('id, name, first_name, last_name, email'),
          supabase.from('clients').select('id, full_name, email, phone, address, agency_name').order('full_name', { ascending: true })
        ]);
        
        if (agentsRes.data && agentsRes.data.length > 0) {
          const list = agentsRes.data.map((p: any) => {
            const full = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.name || p.email || 'Agent';
            return { id: p.id, name: full };
          });
          setAgents(list);
        }

        if (clientsRes.data) {
          const personalOnly = clientsRes.data.filter((c: any) => !c.agency_name || c.agency_name.trim() === '');
          setPersonalClientsList(personalOnly.map((c: any) => ({
            id: c.id,
            full_name: c.full_name,
            email: c.email || '',
            phone: c.phone || '',
            address: c.address || ''
          })));
        }
      } catch (err) {
        console.error('Error fetching wizard options:', err);
      }
    }
    loadData();
  }, [isOpen]);

  useEffect(() => {
    if (currentUserId && !assignedAgentId) {
      setAssignedAgentId(currentUserId);
    }
  }, [currentUserId, assignedAgentId]);

  if (!isOpen) return null;

  const handleReset = () => {
    setStep(1);
    setPolicyType('');
    setPcClientType('');
    setHealthEnrollmentType('');
    setLifeProductType('');
    setFullName('');
    setCompanyName('');
    setSelectedContactClientId('');
    setEmail('');
    setPhone('');
    setDateOfBirth('');
    setStreetAddress('');
    setCity('');
    setState('');
    setZipCode('');
    setFormError(null);
    setFormSaving(false);
    onClose();
  };

  const handleAddressSelected = (addr: NormalizedAddress) => {
    setStreetAddress(addr.streetAddress || '');
    setCity(addr.city || '');
    setState(addr.state || '');
    setZipCode(addr.postalCode || '');
  };

  const canContinueStep1 = policyType !== '';
  const canContinueStep2 =
    (policyType === 'property_casualty' && pcClientType !== '') ||
    (policyType === 'health' && healthEnrollmentType !== '') ||
    (policyType === 'life' && lifeProductType !== '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formSaving) return;

    const isCompany = (policyType === 'property_casualty' && pcClientType === 'company');

    // Validate Step 3 fields
    if (isCompany) {
      if (!companyName.trim()) {
        setFormError('Company Name is required.');
        return;
      }
      if (!fullName.trim()) {
        setFormError('Contact Person Name is required.');
        return;
      }
    } else {
      if (!fullName.trim()) {
        setFormError('Full Name is required.');
        return;
      }
    }

    if (!email.trim() && !phone.trim()) {
      setFormError('Please provide at least an Email address or Phone number.');
      return;
    }

    setFormSaving(true);
    setFormError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const activeAgentId = assignedAgentId || user?.id || currentUserId;

      if (!activeAgentId) {
        throw new Error('Not authenticated or assigned agent missing.');
      }

      // Format combined address string
      const addrParts = [streetAddress.trim(), city.trim(), state.trim(), zipCode.trim()].filter(Boolean);
      const formattedAddress = addrParts.length > 0 ? addrParts.join(', ') : null;

      // 1. Create Client Row in `clients`
      // For Company clients: full_name stores Company Name (e.g. ABC Roofing LLC). agency_name remains null unless applicable.
      // For Personal clients: full_name stores Personal Name.
      const clientPayload: any = {
        agent_id: activeAgentId,
        client_type: isCompany ? 'company' : 'personal',
        full_name: isCompany ? companyName.trim() : fullName.trim(),
        agency_name: null,
        address: formattedAddress,
        email: email.trim() || null,
        phone: phone.trim() || null,
        updated_at: new Date().toISOString()
      };

      const { data: newClient, error: clientErr } = await supabase
        .from('clients')
        .insert(clientPayload)
        .select()
        .single();

      if (clientErr) throw clientErr;

      const clientId = newClient.id;

      // 2. Save Residence Information
      if (streetAddress || city || state || zipCode) {
        await supabase
          .from('client_residence_information')
          .insert({
            client_id: clientId,
            address: streetAddress.trim() || null,
            city: city.trim() || null,
            state: state.trim() || null,
            zip_code: zipCode.trim() || null
          });
      }

      // 3. Save Personal Information / Contact Person
      // For Company clients: full_name stores Contact Person name (e.g. Daniel Rodriguez).
      // Person-only fields (DOB, SSN, Gender, Marital Status, Co-Applicant) are explicitly null/false.
      const parsedDob = isCompany ? null : parseDisplayDate(dateOfBirth);
      await supabase
        .from('client_personal_information')
        .insert({
          client_id: clientId,
          full_name: fullName.trim(),
          date_of_birth: parsedDob || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          has_co_applicant: false
        });

      // 4. Policy Type Initialization
      let redirectUrl = `/clients/${clientId}`;

      if (policyType === 'property_casualty') {
        redirectUrl = `/clients/${clientId}?tab=policies`;
      } else if (policyType === 'health') {
        const renovationStatus = healthEnrollmentType === 'new_enrollment' ? 'New Policy 2026' : 'Renewal 2026';
        
        await supabase
          .from('health_policies')
          .insert({
            client_id: clientId,
            active: false,
            renovation_status: renovationStatus,
            updated_at: new Date().toISOString()
          });

        redirectUrl = `/clients/${clientId}?tab=health`;
      } else if (policyType === 'life') {
        // Create Life Policy container & Product
        const { data: lifePol, error: lifeErr } = await supabase
          .from('life_policies')
          .insert({
            client_id: clientId,
            status: 'Pending'
          })
          .select()
          .single();

        if (lifeErr) throw lifeErr;

        if (lifePol) {
          await supabase
            .from('life_policy_products')
            .insert({
              life_policy_id: lifePol.id,
              product_type: lifeProductType
            });
        }

        redirectUrl = `/clients/${clientId}?tab=life`;
      }

      // Reset modal and perform smooth router push without full page reload
      handleReset();
      router.push(redirectUrl);
    } catch (err: any) {
      console.error('Failed to create client:', err);
      setFormError(err?.message || 'Failed to create client. Please try again.');
      setFormSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in font-sans overflow-y-auto">
      <div className="w-full max-w-2xl bg-white border border-slate-100 rounded-2xl shadow-2xl p-6 md:p-8 animate-scale-up my-8 max-h-[90vh] flex flex-col justify-between">
        
        {/* Header */}
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
            <div>
              <h3 className="text-xl font-extrabold text-slate-900">New Client Creation</h3>
              <p className="text-xs text-slate-400 mt-0.5">Policy-first guided workflow</p>
            </div>
            <button
              onClick={handleReset}
              className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Wizard Progress Bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2">
              <span className={step >= 1 ? 'text-blue-600' : 'text-slate-300'}>1. Policy Type</span>
              <span className={step >= 2 ? 'text-blue-600' : 'text-slate-300'}>2. Policy Details</span>
              <span className={step >= 3 ? 'text-blue-600' : 'text-slate-300'}>3. Client Information</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
              <div
                className="bg-blue-600 h-full transition-all duration-300 ease-out"
                style={{ width: step === 1 ? '33.3%' : step === 2 ? '66.6%' : '100%' }}
              />
            </div>
          </div>

          {formError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-medium">
              {formError}
            </div>
          )}

          {/* STEP 1: POLICY TYPE */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center md:text-left">
                <h4 className="text-lg font-bold text-slate-800">What type of policy are you creating?</h4>
                <p className="text-sm text-slate-500 mt-1">Select the main insurance line for this new client.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    id: 'property_casualty' as const,
                    title: 'Property & Casualty',
                    desc: 'Auto, Home, Commercial & Liability',
                    icon: (
                      <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m3 0h4M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    )
                  },
                  {
                    id: 'health' as const,
                    title: 'Health',
                    desc: 'ACA Marketplace, Medical & Dental',
                    icon: (
                      <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    )
                  },
                  {
                    id: 'life' as const,
                    title: 'Life',
                    desc: 'Term, IUL, Whole Life & Annuities',
                    icon: (
                      <svg className="w-7 h-7 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    )
                  }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setPolicyType(opt.id);
                      setFormError(null);
                    }}
                    className={`p-5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between space-y-3 ${
                      policyType === opt.id
                        ? 'border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-500/20'
                        : 'border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-slate-100/50'
                    }`}
                  >
                    <div>{opt.icon}</div>
                    <div>
                      <h5 className="font-bold text-slate-800 text-sm">{opt.title}</h5>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: POLICY-SPECIFIC QUESTION */}
          {step === 2 && (
            <div className="space-y-6">
              {policyType === 'property_casualty' && (
                <div className="space-y-4">
                  <h4 className="text-lg font-bold text-slate-800">Select Property & Casualty Client Type</h4>
                  <p className="text-sm text-slate-500">Are you creating an individual or company policy?</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {[
                      { id: 'individual' as const, title: 'Individual', desc: 'Personal lines (Auto, Home, Umbrella)' },
                      { id: 'company' as const, title: 'Company', desc: 'Commercial lines (Business, BOP, Commercial Auto)' }
                    ].map(type => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => {
                          setPcClientType(type.id);
                          setFormError(null);
                        }}
                        className={`p-5 rounded-2xl border-2 text-left transition-all ${
                          pcClientType === type.id
                            ? 'border-blue-600 bg-blue-50/50 shadow-md'
                            : 'border-slate-100 bg-slate-50/50 hover:border-slate-200'
                        }`}
                      >
                        <h5 className="font-bold text-slate-800 text-sm">{type.title}</h5>
                        <p className="text-xs text-slate-400 mt-1">{type.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {policyType === 'health' && (
                <div className="space-y-4">
                  <h4 className="text-lg font-bold text-slate-800">Select Health Enrollment Type</h4>
                  <p className="text-sm text-slate-500">Is this a new enrollment or an annual renewal?</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {[
                      { id: 'new_enrollment' as const, title: 'New Enrollment', desc: 'First-time ACA / Marketplace applicant' },
                      { id: 'renewal' as const, title: 'Renewal', desc: 'Existing policy annual renewal or transfer' }
                    ].map(type => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => {
                          setHealthEnrollmentType(type.id);
                          setFormError(null);
                        }}
                        className={`p-5 rounded-2xl border-2 text-left transition-all ${
                          healthEnrollmentType === type.id
                            ? 'border-emerald-600 bg-emerald-50/50 shadow-md'
                            : 'border-slate-100 bg-slate-50/50 hover:border-slate-200'
                        }`}
                      >
                        <h5 className="font-bold text-slate-800 text-sm">{type.title}</h5>
                        <p className="text-xs text-slate-400 mt-1">{type.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {policyType === 'life' && (
                <div className="space-y-4">
                  <h4 className="text-lg font-bold text-slate-800">Select Life Insurance Product Type</h4>
                  <p className="text-sm text-slate-500">Choose the initial Life product category for this client.</p>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                    {[
                      'Term',
                      'IUL',
                      'Whole Life',
                      'VUL',
                      'Term - Disability',
                      'Costumer Whole Life'
                    ].map((pType) => (
                      <button
                        key={pType}
                        type="button"
                        onClick={() => {
                          setLifeProductType(pType as LifeProductType);
                          setFormError(null);
                        }}
                        className={`p-4 rounded-xl border-2 text-center transition-all ${
                          lifeProductType === pType
                            ? 'border-purple-600 bg-purple-50/50 font-extrabold text-purple-900 shadow-md'
                            : 'border-slate-100 bg-slate-50/50 hover:border-slate-200 font-semibold text-slate-700'
                        }`}
                      >
                        <span className="text-xs">{pType}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: COMMON CLIENT FORM */}
          {step === 3 && (
            <form id="wizard-client-form" onSubmit={handleSubmit} className="space-y-4">
              {policyType === 'property_casualty' && pcClientType === 'company' ? (
                <div className="space-y-4">
                  <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 space-y-1">
                    <span className="font-extrabold uppercase tracking-wider text-[10px] text-blue-600 block">Commercial Company Profile</span>
                    <p>Creating a Company client profile. Enter Company details below and optionally link an existing Personal client as Contact Person.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Company Name *</label>
                      <input
                        type="text"
                        value={companyName}
                        onChange={e => setCompanyName(e.target.value)}
                        placeholder="e.g. ABC Roofing LLC"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Select Existing Personal Contact (Optional)</label>
                      <select
                        value={selectedContactClientId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedContactClientId(id);
                          if (id) {
                            const match = personalClientsList.find(c => c.id === id);
                            if (match) {
                              setFullName(match.full_name || '');
                              if (match.email) setEmail(match.email);
                              if (match.phone) setPhone(match.phone);
                              if (match.address) {
                                const parts = match.address.split(',').map(s => s.trim());
                                if (parts.length >= 1) setStreetAddress(parts[0]);
                                if (parts.length >= 2) setCity(parts[1]);
                                if (parts.length >= 3) setState(parts[2].split(' ')[0]);
                                if (parts.length >= 3 && parts[2].split(' ').length > 1) setZipCode(parts[2].split(' ')[1]);
                              }
                            }
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-4 py-2 text-slate-800 text-sm outline-none transition-all"
                      >
                        <option value="">-- Add New Contact Person --</option>
                        {personalClientsList.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.full_name} {c.email ? `(${c.email})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Contact Person Name *</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="e.g. Daniel Rodriguez"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Full Name *</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="e.g. Robert Smith"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Date of Birth</label>
                    <input
                      type="text"
                      value={dateOfBirth}
                      onChange={e => setDateOfBirth(e.target.value)}
                      placeholder="MM/DD/YYYY"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="e.g. client@example.com"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Phone Number</label>
                  <PhoneInput
                    value={phone}
                    onChange={setPhone}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Street Address</label>
                <GoogleAddressAutocomplete
                  value={streetAddress}
                  onChange={setStreetAddress}
                  onAddressSelected={handleAddressSelected}
                  placeholder="Start typing street address for Google autocomplete..."
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="City"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">State</label>
                  <input
                    type="text"
                    value={state}
                    onChange={e => setState(e.target.value)}
                    placeholder="FL"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">ZIP Code</label>
                  <input
                    type="text"
                    value={zipCode}
                    onChange={e => setZipCode(e.target.value)}
                    placeholder="33101"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 text-sm outline-none"
                  />
                </div>
              </div>

              {agents.length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Assigned Agent</label>
                  <select
                    value={assignedAgentId}
                    onChange={e => setAssignedAgentId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-4 py-2 text-slate-800 text-sm outline-none"
                  >
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-6">
          {step === 1 ? (
            <button
              type="button"
              onClick={handleReset}
              className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl px-5 py-2.5 text-xs uppercase tracking-wider transition-all"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setStep((prev) => (prev === 3 ? 2 : 1) as 1 | 2);
              }}
              className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl px-5 py-2.5 text-xs uppercase tracking-wider transition-all"
            >
              Back
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 ? !canContinueStep1 : !canContinueStep2}
              onClick={() => {
                setFormError(null);
                setStep((prev) => (prev === 1 ? 2 : 3) as 2 | 3);
              }}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl px-6 py-2.5 text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-500/10"
            >
              Continue →
            </button>
          ) : (
            <button
              type="submit"
              form="wizard-client-form"
              disabled={formSaving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl px-6 py-2.5 text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-500/10"
            >
              {formSaving ? 'Creating Client...' : 'Create Client'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
