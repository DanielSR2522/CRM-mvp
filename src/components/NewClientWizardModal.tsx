'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import PhoneInput from '@/components/common/PhoneInput';
import SSNInput from '@/components/common/SSNInput';
import GoogleAddressAutocomplete, { NormalizedAddress } from '@/components/address/GoogleAddressAutocomplete';
import { parseDisplayDate, formatAsDateInput, isValidDisplayDate } from '@/utils/dateUtils';
import { formatEIN } from '@/lib/formatters/ein';
import { setInMemoryHouseholdDraft } from '@/lib/health/household-draft-store';

interface NewClientWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
}

export type PolicyType = 'property_casualty' | 'health' | 'life' | 'medicare' | 'supplemental';
export type PcClientType = 'individual' | 'company';

export default function NewClientWizardModal({
  isOpen,
  onClose,
  currentUserId
}: NewClientWizardModalProps) {
  const router = useRouter();

  // 2-step guided workflow: 1. Select Product -> 2. Full Personal Info -> Opens actual policy form
  const [step, setStep] = useState<1 | 2>(1);

  // Product Selection
  const [policyType, setPolicyType] = useState<PolicyType | ''>('');
  const [pcClientType, setPcClientType] = useState<PcClientType>('individual');

  // Personal Info Form Fields (Full Approved Profile Experience)
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [ein, setEin] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [ssn, setSsn] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | ''>('');
  const [maritalStatus, setMaritalStatus] = useState<'Single' | 'Married' | 'Divorced' | 'Widowed' | 'Separated' | 'Domestic Partner' | ''>('');
  const [languagePreference, setLanguagePreference] = useState<'English' | 'Spanish' | 'Portuguese' | 'Other' | ''>('English');

  // Residence Fields
  const [streetAddress, setStreetAddress] = useState('');
  const [unit, setUnit] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [county, setCounty] = useState('');
  const [residenceType, setResidenceType] = useState<'Own' | 'Rent' | 'Other' | ''>('');

  // Co-Applicant / Spouse Information
  const [hasCoApplicant, setHasCoApplicant] = useState(false);
  const [coFullName, setCoFullName] = useState('');
  const [coDateOfBirth, setCoDateOfBirth] = useState('');
  const [coSsn, setCoSsn] = useState('');
  const [coPhone, setCoPhone] = useState('');
  const [coEmail, setCoEmail] = useState('');
  const [coGender, setCoGender] = useState<'Male' | 'Female' | 'Other' | ''>('');
  const [coRelationship, setCoRelationship] = useState('Spouse');

  // Health-specific initial household members draft
  const [healthHouseholdCount, setHealthHouseholdCount] = useState<number>(1);
  const [draftDependents, setDraftDependents] = useState<Array<{
    member_number: number;
    full_name: string;
    date_of_birth: string;
    relationship_to_applicant: string;
    gender: string;
    us_citizen: boolean;
    uses_tobacco: boolean;
    ssn: string;
  }>>([]);

  // Agents dropdown options
  const [assignedAgentId, setAssignedAgentId] = useState(currentUserId || '');
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [personalClientsList, setPersonalClientsList] = useState<{ id: string; full_name: string; email?: string; phone?: string; address?: string }[]>([]);
  const [selectedContactClientId, setSelectedContactClientId] = useState<string>('');

  // UI state
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Sync draft dependents when healthHouseholdCount changes
  useEffect(() => {
    if (healthHouseholdCount > 1) {
      const targetCount = healthHouseholdCount - 1;
      setDraftDependents(prev => {
        const next = [...prev];
        while (next.length < targetCount) {
          const num = next.length + 2;
          next.push({
            member_number: num,
            full_name: '',
            date_of_birth: '',
            relationship_to_applicant: num === 2 ? 'Spouse' : 'Son',
            gender: '',
            us_citizen: true,
            uses_tobacco: false,
            ssn: ''
          });
        }
        return next.slice(0, targetCount);
      });
    } else {
      setDraftDependents([]);
    }
  }, [healthHouseholdCount]);

  // Load agents list for agent assignment dropdown & personal clients for contact selector
  useEffect(() => {
    async function loadData() {
      if (!isOpen) return;
      try {
        const [agentsRes, clientsRes] = await Promise.all([
          supabase.from('profiles').select('id, name, first_name, last_name, email'),
          supabase.from('clients').select('id, full_name, email, phone, address, client_type').order('full_name', { ascending: true })
        ]);

        if (agentsRes.data && agentsRes.data.length > 0) {
          const list = agentsRes.data.map((p: any) => {
            const full = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.name || p.email || 'Agent';
            return { id: p.id, name: full };
          });
          setAgents(list);
        }

        if (clientsRes.data) {
          const personalOnly = clientsRes.data.filter((c: any) => c.client_type === 'personal' || (!c.client_type && !c.agency_name));
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
    setPcClientType('individual');
    setFullName('');
    setCompanyName('');
    setEin('');
    setSelectedContactClientId('');
    setEmail('');
    setPhone('');
    setSecondaryPhone('');
    setDateOfBirth('');
    setSsn('');
    setGender('');
    setMaritalStatus('');
    setLanguagePreference('English');
    setStreetAddress('');
    setUnit('');
    setCity('');
    setState('');
    setZipCode('');
    setCounty('');
    setResidenceType('');
    setHasCoApplicant(false);
    setCoFullName('');
    setCoDateOfBirth('');
    setCoSsn('');
    setCoPhone('');
    setCoEmail('');
    setCoGender('');
    setCoRelationship('Spouse');
    setHealthHouseholdCount(1);
    setDraftDependents([]);
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

  const isCompany = (policyType === 'property_casualty' && pcClientType === 'company');

  const updateDraftDependent = (index: number, field: string, val: any) => {
    setDraftDependents(prev => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], [field]: val };
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formSaving) return;

    // Validate fields
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

    if (dateOfBirth && !isValidDisplayDate(dateOfBirth)) {
      setFormError('Date of Birth must be in MM/DD/YYYY format.');
      return;
    }

    if (hasCoApplicant && coDateOfBirth && !isValidDisplayDate(coDateOfBirth)) {
      setFormError('Co-Applicant Date of Birth must be in MM/DD/YYYY format.');
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
      const fullStreet = [streetAddress.trim(), unit.trim()].filter(Boolean).join(' ');
      const addrParts = [fullStreet, city.trim(), state.trim(), zipCode.trim()].filter(Boolean);
      const formattedAddress = addrParts.length > 0 ? addrParts.join(', ') : null;

      // 1. Create Client Row in `clients`
      const clientPayload: any = {
        agent_id: activeAgentId,
        client_type: isCompany ? 'company' : 'personal',
        full_name: isCompany ? companyName.trim() : fullName.trim(),
        ein: isCompany ? (formatEIN(ein).trim() || null) : null,
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

      // Persist relationship if an existing Personal client was selected for Company
      if (isCompany && selectedContactClientId) {
        await supabase
          .from('client_company_relationships')
          .insert({
            company_client_id: clientId,
            personal_client_id: selectedContactClientId,
            relationship_type: 'contact_person'
          });
      }

      // 2. Save Residence Information (sub-table)
      if (streetAddress || city || state || zipCode || county || residenceType) {
        await supabase
          .from('client_residence_information')
          .insert({
            client_id: clientId,
            address: fullStreet || null,
            city: city.trim() || null,
            state: state.trim() || null,
            zip_code: zipCode.trim() || null,
            county: county.trim() || null,
            residence_type: residenceType || null,
            updated_at: new Date().toISOString()
          });
      }

      // 3. Save Personal Information (sub-table)
      const parsedDob = isCompany ? null : parseDisplayDate(dateOfBirth);
      await supabase
        .from('client_personal_information')
        .insert({
          client_id: clientId,
          full_name: fullName.trim(),
          date_of_birth: parsedDob || null,
          ssn: (!isCompany && ssn.trim()) ? ssn.trim() : null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          secondary_phone: secondaryPhone.trim() || null,
          gender: gender || null,
          marital_status: maritalStatus || null,
          language_preference: languagePreference || 'English',
          has_co_applicant: !isCompany && hasCoApplicant
        });

      // 4. Save Co-Applicant Information (sub-table) if enabled
      if (!isCompany && hasCoApplicant && coFullName.trim()) {
        const parsedCoDob = parseDisplayDate(coDateOfBirth);
        const { error: coAppErr } = await supabase
          .from('client_co_applicant_information')
          .insert({
            client_id: clientId,
            full_name: coFullName.trim(),
            date_of_birth: parsedCoDob || null,
            ssn: coSsn.trim() || null,
            primary_phone: coPhone.trim() || null,
            primary_email: coEmail.trim() || null,
            gender: coGender || null,
            marital_status: maritalStatus || null,
            updated_at: new Date().toISOString()
          });
        if (coAppErr) {
          console.error('Co-applicant save error:', coAppErr);
        }
      }

      // 5. Handle Health in-memory draft transfer (NEVER create dummy policies)
      if (policyType === 'health') {
        const count = Math.max(1, healthHouseholdCount || 1);
        const householdMembersDraft = draftDependents.map(d => ({
          member_number: d.member_number,
          coverage: true,
          full_name: d.full_name || '',
          date_of_birth: d.date_of_birth ? parseDisplayDate(d.date_of_birth) : null,
          relationship_to_applicant: d.relationship_to_applicant || 'Son',
          gender: d.gender || '',
          us_citizen: d.us_citizen,
          uses_tobacco: d.uses_tobacco,
          annual_income: 0,
          ssn_encrypted: null,
          draft_ssn: d.ssn ? d.ssn.trim() : '' // protected in-memory handling only
        }));

        // Save in-memory draft store
        setInMemoryHouseholdDraft(clientId, {
          taxMemberCount: count,
          members: householdMembersDraft
        });

        // Mirror non-sensitive draft to sessionStorage for reload tolerance (SSNs strictly excluded)
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(`health_household_draft_${clientId}`, JSON.stringify({
              taxMemberCount: count,
              members: householdMembersDraft.map(m => ({
                ...m,
                draft_ssn: undefined // Exclude sensitive SSN
              }))
            }));
          } catch {}
        }
      }

      // 6. Route directly to the actual new policy form for the selected product
      let redirectUrl = `/clients/${clientId}`;

      if (policyType === 'property_casualty') {
        redirectUrl = `/clients/${clientId}/policies/new`;
      } else if (policyType === 'health') {
        redirectUrl = `/clients/${clientId}?tab=health&action=new`;
      } else if (policyType === 'life') {
        redirectUrl = `/clients/${clientId}?tab=life&action=new`;
      } else if (policyType === 'medicare') {
        redirectUrl = `/clients/${clientId}?tab=medicare&action=new`;
      } else if (policyType === 'supplemental') {
        redirectUrl = `/clients/${clientId}?tab=supplemental&action=new`;
      }

      // Close modal and navigate
      handleReset();
      router.push(redirectUrl);
    } catch (err: any) {
      console.error('Failed to create client:', err);
      setFormError(err?.message || 'Failed to create client. Please try again.');
      setFormSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in font-sans overflow-hidden">
      <div className="w-full max-w-4xl bg-white border border-slate-100 rounded-2xl shadow-2xl animate-scale-up max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="p-6 md:p-8 pb-4 flex-shrink-0 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-extrabold text-slate-900">New Client Creation</h3>
              <p className="text-xs text-slate-400 mt-0.5">Guided product-to-policy creation workflow</p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg cursor-pointer"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Wizard Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2">
              <span className={step >= 1 ? 'text-blue-600 font-bold' : 'text-slate-300'}>1. Select Product</span>
              <span className={step >= 2 ? 'text-blue-600 font-bold' : 'text-slate-300'}>2. Personal Information &amp; Details</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
              <div
                className="bg-blue-600 h-full transition-all duration-300 ease-out"
                style={{ width: step === 1 ? '50%' : '100%' }}
              />
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 md:p-8 flex-1 min-h-0 overflow-y-auto space-y-6">
          {formError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-medium">
              {formError}
            </div>
          )}

          {/* STEP 1: SELECT PRODUCT */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="text-left">
                <h4 className="text-lg font-bold text-slate-800">What product are you creating this client for?</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Select the primary product line to begin. After confirming client personal details, you will be taken directly to the policy form for that product.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    id: 'health' as const,
                    title: 'Health',
                    desc: 'Individual & Family health plans, ACA marketplace enrollments, and medical coverage.',
                    chips: ['ACA Marketplace', 'Medical'],
                    icon: (
                      <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    )
                  },
                  {
                    id: 'property_casualty' as const,
                    title: 'Property & Casualty',
                    desc: 'Personal lines auto and homeowners insurance alongside commercial business liability policies.',
                    chips: ['Auto', 'Home', 'Commercial', 'Liability'],
                    icon: (
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m3 0h4M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    )
                  },
                  {
                    id: 'life' as const,
                    title: 'Life Insurance',
                    desc: 'Financial protection policies including term life, index universal life (IUL), whole life, and annuities.',
                    chips: ['Term', 'IUL', 'Whole Life', 'Annuities'],
                    icon: (
                      <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    )
                  },
                  {
                    id: 'medicare' as const,
                    title: 'Medicare',
                    desc: 'Senior health coverage, Advantage plans, prescription Part D, and Medigap supplement policies.',
                    chips: ['Medicare Advantage', 'Supplement', 'Part D'],
                    icon: (
                      <svg className="w-6 h-6 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    )
                  },
                  {
                    id: 'supplemental' as const,
                    title: 'Supplemental',
                    desc: 'Voluntary gap protection including accident, critical illness, and hospital indemnity plans.',
                    chips: ['Accident', 'Critical Illness', 'Hospital Indemnity'],
                    icon: (
                      <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                    className={`p-5 rounded-2xl border text-left transition-all flex flex-col justify-between space-y-3 cursor-pointer ${
                      policyType === opt.id
                        ? 'border-blue-600 bg-blue-50/40 shadow-md ring-2 ring-blue-500/20'
                        : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">{opt.icon}</div>
                      {policyType === opt.id && (
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                          ✓
                        </span>
                      )}
                    </div>
                    <div>
                      <h5 className="font-bold text-slate-900 text-sm">{opt.title}</h5>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{opt.desc}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {opt.chips.map(chip => (
                        <span
                          key={chip}
                          className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>

              {/* Property & Casualty Personal vs Commercial Toggle */}
              {policyType === 'property_casualty' && (
                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100 space-y-3 animate-fade-in">
                  <span className="text-xs font-bold text-blue-900 uppercase tracking-wider block">
                    Property &amp; Casualty Policy Category
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPcClientType('individual')}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        pcClientType === 'individual'
                          ? 'border-blue-600 bg-white font-bold text-blue-900 shadow-sm'
                          : 'border-slate-200 bg-white/60 text-slate-700 hover:bg-white'
                      }`}
                    >
                      <span className="block text-xs font-bold">Personal Lines</span>
                      <span className="text-[11px] text-slate-500">Auto, Home, Personal Umbrella</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPcClientType('company')}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        pcClientType === 'company'
                          ? 'border-blue-600 bg-white font-bold text-blue-900 shadow-sm'
                          : 'border-slate-200 bg-white/60 text-slate-700 hover:bg-white'
                      }`}
                    >
                      <span className="block text-xs font-bold">Commercial Lines</span>
                      <span className="text-[11px] text-slate-500">Company, General Liability, BOP</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: FULL PERSONAL / COMPANY INFORMATION FORM */}
          {step === 2 && (
            <form id="wizard-client-form" onSubmit={handleSubmit} className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h4 className="text-lg font-bold text-slate-800">
                    {isCompany ? 'Company & Contact Details' : 'Personal Information'}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Enter the client&apos;s details to create their profile and proceed directly to the policy form.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wider">
                  {policyType === 'property_casualty'
                    ? (pcClientType === 'company' ? 'Commercial P&C' : 'Personal P&C')
                    : policyType}
                </span>
              </div>

              {/* 1. Commercial / Company Fields */}
              {isCompany ? (
                <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">Company Identification</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Company Name *</label>
                      <input
                        type="text"
                        value={companyName}
                        onChange={e => setCompanyName(e.target.value)}
                        placeholder="e.g. Acme Logistics LLC"
                        className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">EIN (XX-XXXXXXX)</label>
                      <input
                        type="text"
                        value={ein}
                        onChange={e => setEin(formatEIN(e.target.value))}
                        placeholder="e.g. 12-3456789"
                        className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Link Existing Contact Person (Optional)</label>
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
                      className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-4 py-2 text-slate-800 text-sm outline-none transition-all"
                    >
                      <option value="">-- Add New Contact Person Details Below --</option>
                      {personalClientsList.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.full_name} {c.email ? `(${c.email})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Contact Person Name *</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="e.g. Robert Smith"
                      className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      required
                    />
                  </div>
                </div>
              ) : (
                /* 2. Personal Client Core Fields */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
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
                        inputMode="numeric"
                        value={dateOfBirth}
                        onChange={e => setDateOfBirth(formatAsDateInput(e.target.value))}
                        placeholder="MM/DD/YYYY"
                        maxLength={10}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">SSN (Optional)</label>
                      <SSNInput
                        value={ssn}
                        onChange={setSsn}
                      />
                    </div>
                  </div>

                  {/* Gender, Marital Status & Preferred Language */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Gender</label>
                      <select
                        value={gender}
                        onChange={e => setGender(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-4 py-2 text-slate-800 text-sm outline-none"
                      >
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Marital Status</label>
                      <select
                        value={maritalStatus}
                        onChange={e => setMaritalStatus(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-4 py-2 text-slate-800 text-sm outline-none"
                      >
                        <option value="">Select Status</option>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widowed">Widowed</option>
                        <option value="Separated">Separated</option>
                        <option value="Domestic Partner">Domestic Partner</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Preferred Language</label>
                      <select
                        value={languagePreference}
                        onChange={e => setLanguagePreference(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-4 py-2 text-slate-800 text-sm outline-none"
                      >
                        <option value="English">English</option>
                        <option value="Spanish">Spanish</option>
                        <option value="Portuguese">Portuguese</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Contact Information */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">Contact Information</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Primary Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Primary Phone</label>
                    <PhoneInput
                      value={phone}
                      onChange={setPhone}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Secondary Phone (Optional)</label>
                    <PhoneInput
                      value={secondaryPhone}
                      onChange={setSecondaryPhone}
                    />
                  </div>
                </div>
              </div>

              {/* 4. Residence & Address Information */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">Residence &amp; Address</span>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Street Address</label>
                    <GoogleAddressAutocomplete
                      value={streetAddress}
                      onChange={setStreetAddress}
                      onAddressSelected={handleAddressSelected}
                      placeholder="Start typing street address for Google autocomplete..."
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Apt / Suite / Unit</label>
                    <input
                      type="text"
                      value={unit}
                      onChange={e => setUnit(e.target.value)}
                      placeholder="Apt 4B"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-4 py-2 text-slate-800 text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Own / Rent</label>
                    <select
                      value={residenceType}
                      onChange={e => setResidenceType(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 text-sm outline-none"
                    >
                      <option value="">Select Type</option>
                      <option value="Own">Own</option>
                      <option value="Rent">Rent</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 5. Co-Applicant / Spouse Information Toggle (Personal Lines) */}
              {!isCompany && (
                <div className="pt-2 border-t border-slate-100 space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hasCoApplicant}
                      onChange={e => setHasCoApplicant(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <span className="text-xs font-bold text-slate-800">Add Co-Applicant / Spouse</span>
                  </label>

                  {hasCoApplicant && (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-4 animate-fade-in">
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-900 block">Co-Applicant Details</span>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Full Name</label>
                          <input
                            type="text"
                            value={coFullName}
                            onChange={e => setCoFullName(e.target.value)}
                            placeholder="e.g. Jane Smith"
                            className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 text-sm outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Date of Birth</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={coDateOfBirth}
                            onChange={e => setCoDateOfBirth(formatAsDateInput(e.target.value))}
                            placeholder="MM/DD/YYYY"
                            maxLength={10}
                            className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 text-sm outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">SSN</label>
                          <SSNInput
                            value={coSsn}
                            onChange={setCoSsn}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Phone</label>
                          <PhoneInput
                            value={coPhone}
                            onChange={setCoPhone}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Email</label>
                          <input
                            type="email"
                            value={coEmail}
                            onChange={e => setCoEmail(e.target.value)}
                            placeholder="spouse@example.com"
                            className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 text-sm outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Relationship</label>
                          <select
                            value={coRelationship}
                            onChange={e => setCoRelationship(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-slate-800 text-sm outline-none"
                          >
                            <option value="Spouse">Spouse</option>
                            <option value="Co-Applicant">Co-Applicant</option>
                            <option value="Domestic Partner">Domestic Partner</option>
                            <option value="Child">Child</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 6. Health-Specific Initial Tax Household Members Draft */}
              {policyType === 'health' && (
                <div className="pt-2 border-t border-slate-100 space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-bold text-emerald-900 block">Initial Tax Household Members</span>
                      <span className="text-[11px] text-emerald-700">Total number of people on tax return</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={15}
                        value={healthHouseholdCount}
                        onChange={e => setHealthHouseholdCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-16 bg-white border border-emerald-300 rounded-lg px-2 py-1 text-center font-bold text-emerald-900 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="text-xs font-bold text-emerald-800">people</span>
                    </div>
                  </div>

                  {draftDependents.length > 0 && (
                    <div className="space-y-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 block">
                        Draft Household Members (Transferred to Policy Form)
                      </span>
                      {draftDependents.map((dep, idx) => (
                        <div key={dep.member_number} className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                          <span className="text-xs font-bold text-slate-700 block">Member #{dep.member_number} Details</span>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="md:col-span-2">
                              <label className="block text-[11px] font-bold text-slate-500 mb-1">Full Name</label>
                              <input
                                type="text"
                                value={dep.full_name}
                                onChange={e => updateDraftDependent(idx, 'full_name', e.target.value)}
                                placeholder="Member Full Name"
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-500 mb-1">Date of Birth</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={dep.date_of_birth}
                                onChange={e => updateDraftDependent(idx, 'date_of_birth', formatAsDateInput(e.target.value))}
                                placeholder="MM/DD/YYYY"
                                maxLength={10}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-500 mb-1">Relationship</label>
                              <select
                                value={dep.relationship_to_applicant}
                                onChange={e => updateDraftDependent(idx, 'relationship_to_applicant', e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none"
                              >
                                <option value="Spouse">Spouse</option>
                                <option value="Son">Son</option>
                                <option value="Daughter">Daughter</option>
                                <option value="Dependent">Dependent</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-500 mb-1">SSN (Draft / In-Memory Protected)</label>
                            <SSNInput
                              value={dep.ssn}
                              onChange={val => updateDraftDependent(idx, 'ssn', val)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 7. Assigned Agent */}
              {agents.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
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

        {/* Footer Navigation */}
        <div className="px-6 py-4 md:px-8 bg-slate-50/50 border-t border-slate-100 flex-shrink-0 flex items-center justify-between">
          {step === 1 ? (
            <button
              type="button"
              onClick={handleReset}
              className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl px-5 py-2.5 text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setStep(1);
              }}
              className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl px-5 py-2.5 text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              ← Back to Products
            </button>
          )}

          {step === 1 ? (
            <button
              type="button"
              disabled={!policyType}
              onClick={() => {
                setFormError(null);
                setStep(2);
              }}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl px-6 py-2.5 text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-500/10 cursor-pointer"
            >
              Continue to Personal Info →
            </button>
          ) : (
            <button
              type="submit"
              form="wizard-client-form"
              disabled={formSaving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl px-6 py-2.5 text-xs uppercase tracking-wider transition-all shadow-md shadow-blue-500/10 cursor-pointer flex items-center gap-2"
            >
              {formSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Creating Client...</span>
                </>
              ) : (
                <span>Create &amp; Proceed to Policy →</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
