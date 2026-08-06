'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import { useBusinessLines } from '@/contexts/BusinessLinesContext';
import { ALL_BUSINESS_LINES, BusinessLine } from '@/lib/auth/businessLines';
import GoogleAddressAutocomplete from '@/components/address/GoogleAddressAutocomplete';
import {
  InlineEditableText,
  InlineEditablePhone,
  InlineEditableSelect,
  InlineEditableAddress,
} from '@/components/common/inline-edit';
import InlineEditActions from '@/components/common/inline-edit/InlineEditActions';

interface AgentProfileForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  npn_number: string;
  license_number: string;

  agency_name: string;
  agency_email: string;
  agency_phone: string;
  website: string;

  address: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;

  preferred_contact_method: string;
  secondary_phone: string;

  timezone: string;
  language: string;
}

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
];

const LANGUAGES = [
  'English',
  'Spanish',
  'French',
];

const CONTACT_METHODS = [
  'Email',
  'Phone',
  'SMS',
  'Mail',
];

export default function AgentInformationPage() {
  const [userId, setUserId] = useState<string | null>(null);

  // Business Lines Context & State
  const { businessLines, saveBusinessLines, loading: businessLinesLoading } = useBusinessLines();
  const [selectedLines, setSelectedLines] = useState<BusinessLine[]>([]);
  const [hasLoadedProfile, setHasLoadedProfile] = useState<boolean>(false);

  // Address Inline Edit State
  const [editingAddress, setEditingAddress] = useState<boolean>(false);
  const [draftAddress, setDraftAddress] = useState<string>('');
  const [draftCity, setDraftCity] = useState<string>('');
  const [draftState, setDraftState] = useState<string>('');
  const [draftZip, setDraftZip] = useState<string>('');
  const [draftCountry, setDraftCountry] = useState<string>('United States');
  const [savingAddress, setSavingAddress] = useState<boolean>(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  // Business Lines Saving State
  const [savingLines, setSavingLines] = useState<boolean>(false);

  // Form State
  const [form, setForm] = useState<AgentProfileForm>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    npn_number: '',
    license_number: '',
    agency_name: '',
    agency_email: '',
    agency_phone: '',
    website: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    country: 'United States',
    preferred_contact_method: 'Email',
    secondary_phone: '',
    timezone: 'America/New_York',
    language: 'English',
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const currentUserId = session.user.id;
        setUserId(currentUserId);

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUserId)
          .maybeSingle();

        if (error) {
          console.error('Error fetching agent profile:', error);
          setErrorMsg(`Error loading profile: ${error.message}`);
        }

        if (data) {
          if (Array.isArray(data.business_lines)) {
            const valid = data.business_lines.filter((b: any): b is BusinessLine =>
              ALL_BUSINESS_LINES.some(a => a.id === b)
            );
            setSelectedLines(valid);
            setHasLoadedProfile(true);
          }

          let fn = data.first_name || '';
          let ln = data.last_name || '';
          if (!fn && !ln && data.name) {
            const parts = data.name.trim().split(/\s+/);
            fn = parts[0] || '';
            ln = parts.slice(1).join(' ') || '';
          }

          setForm({
            first_name: fn,
            last_name: ln,
            email: data.email || session.user.email || '',
            phone: data.phone || '',
            npn_number: data.npn_number || '',
            license_number: data.license_number || '',
            agency_name: data.agency_name || '',
            agency_email: data.agency_email || '',
            agency_phone: data.agency_phone || '',
            website: data.website || '',
            address: data.address || '',
            city: data.city || '',
            state: data.state || '',
            zip_code: data.zip_code || '',
            country: data.country || 'United States',
            preferred_contact_method: data.preferred_contact_method || 'Email',
            secondary_phone: data.secondary_phone || '',
            timezone: data.timezone || 'America/New_York',
            language: data.language || 'English',
          });
        } else {
          setForm(prev => ({ ...prev, email: session.user.email || '' }));
        }
      } catch (err: any) {
        console.error('Failed to load profile:', err);
        setErrorMsg('Failed to load profile data.');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  useEffect(() => {
    if (!businessLinesLoading && !hasLoadedProfile && businessLines && businessLines.length > 0) {
      setSelectedLines(businessLines);
    }
  }, [businessLines, businessLinesLoading, hasLoadedProfile]);

  // ATOMIC SINGLE-FIELD PERSISTENCE FUNCTION
  const saveProfileField = async (fieldOrPayload: string | Record<string, any>, value?: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id || userId;
    if (!currentUserId) throw new Error('User session not found.');

    let patch: Record<string, any> = {};
    if (typeof fieldOrPayload === 'string') {
      patch[fieldOrPayload] = value;
    } else {
      patch = { ...fieldOrPayload };
    }

    const nextFn = patch.first_name !== undefined ? patch.first_name : form.first_name;
    const nextLn = patch.last_name !== undefined ? patch.last_name : form.last_name;
    const computedName = `${(nextFn || '').trim()} ${(nextLn || '').trim()}`.trim() || session?.user?.email || 'Agent Profile';

    const upsertPayload = {
      id: currentUserId,
      name: computedName,
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      phone: form.phone,
      npn_number: form.npn_number,
      license_number: form.license_number,
      agency_name: form.agency_name,
      agency_email: form.agency_email,
      agency_phone: form.agency_phone,
      website: form.website,
      address: form.address,
      city: form.city,
      state: form.state,
      zip_code: form.zip_code,
      country: form.country,
      preferred_contact_method: form.preferred_contact_method,
      secondary_phone: form.secondary_phone,
      timezone: form.timezone,
      language: form.language,
      business_lines: selectedLines,
      ...patch,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedRow, error: profileErr } = await supabase
      .from('profiles')
      .upsert(upsertPayload, { onConflict: 'id' })
      .select('*')
      .maybeSingle();

    if (profileErr || !updatedRow) {
      throw profileErr || new Error('Zero rows returned from Supabase profiles upsert.');
    }

    setForm(prev => ({ ...prev, ...patch }));
    flashSuccess('Field updated successfully!');
  };

  // ATOMIC ADDRESS SAVE
  const handleSaveAddress = async () => {
    if (savingAddress) return;
    setSavingAddress(true);
    setAddressError(null);
    try {
      await saveProfileField({
        address: draftAddress.trim(),
        city: draftCity.trim(),
        state: draftState.trim(),
        zip_code: draftZip.trim(),
        country: draftCountry.trim() || 'United States',
      });
      setEditingAddress(false);
    } catch (err: any) {
      setAddressError(err?.message || 'Failed to save address.');
    } finally {
      setSavingAddress(false);
    }
  };

  const handleStartAddressEdit = () => {
    setDraftAddress(form.address);
    setDraftCity(form.city);
    setDraftState(form.state);
    setDraftZip(form.zip_code);
    setDraftCountry(form.country || 'United States');
    setAddressError(null);
    setEditingAddress(true);
  };

  const handleCancelAddressEdit = () => {
    setDraftAddress(form.address);
    setDraftCity(form.city);
    setDraftState(form.state);
    setDraftZip(form.zip_code);
    setDraftCountry(form.country || 'United States');
    setAddressError(null);
    setEditingAddress(false);
  };

  // BUSINESS LINES TOGGLE & SAVE
  const toggleLine = (lineId: BusinessLine) => {
    setSelectedLines(prev => {
      const next = prev.includes(lineId)
        ? prev.filter(l => l !== lineId)
        : [...prev, lineId];
      return next;
    });
  };

  const handleSaveBusinessLines = async () => {
    setSavingLines(true);
    setErrorMsg(null);
    try {
      await saveProfileField('business_lines', selectedLines);
      await saveBusinessLines(selectedLines);
      flashSuccess('Business lines updated successfully!');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update business lines.');
    } finally {
      setSavingLines(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto pb-10 font-sans">
        
        {/* Compact Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-[#DCE2EA] rounded-md p-5 shadow-2xs">
          <div>
            <h1 className="text-xl font-semibold text-[#172033] tracking-tight">
              Agent Information
            </h1>
            <p className="text-xs text-[#556176] mt-0.5">
              Click any field to edit directly and save atomically.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="bg-white border border-[#DCE2EA] rounded-md p-12 text-center text-[#7C8799] text-xs font-medium">
            Loading agent information...
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Status Messages */}
            {errorMsg && (
              <div className="p-3.5 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-[#C24141] text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 rounded-md bg-[#F0FDF4] border border-[#DCFCE7] text-[#15803D] text-xs font-semibold">
                {successMsg}
              </div>
            )}

            {/* TWO-COLUMN RESPONSIVE LAYOUT */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* LEFT COLUMN */}
              <div className="space-y-6">
                
                {/* SECTION 1: AGENT DETAILS */}
                <div className="crm-card p-5 space-y-4">
                  <div className="border-b border-[#E8ECF2] pb-3">
                    <h2 className="text-sm font-semibold text-[#172033]">Agent Details</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InlineEditableText
                      label="First Name *"
                      value={form.first_name}
                      onSave={val => {
                        if (!val) throw new Error('First Name is required');
                        return saveProfileField('first_name', val);
                      }}
                    />
                    <InlineEditableText
                      label="Last Name *"
                      value={form.last_name}
                      onSave={val => {
                        if (!val) throw new Error('Last Name is required');
                        return saveProfileField('last_name', val);
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InlineEditableText
                      label="Email Address *"
                      type="email"
                      value={form.email}
                      onSave={val => {
                        if (!val || !val.includes('@')) throw new Error('Valid email address required');
                        return saveProfileField('email', val);
                      }}
                    />
                    <InlineEditablePhone
                      label="Phone Number"
                      value={form.phone}
                      onSave={val => saveProfileField('phone', val)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InlineEditableText
                      label="NPN Number"
                      value={form.npn_number}
                      onSave={val => saveProfileField('npn_number', val)}
                    />
                    <InlineEditableText
                      label="License Number"
                      value={form.license_number}
                      onSave={val => saveProfileField('license_number', val)}
                    />
                  </div>
                </div>

                {/* SECTION 2: AGENCY INFORMATION */}
                <div className="crm-card p-5 space-y-4">
                  <div className="border-b border-[#E8ECF2] pb-3">
                    <h2 className="text-sm font-semibold text-[#172033]">Agency Information</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InlineEditableText
                      label="Agency Name"
                      value={form.agency_name}
                      onSave={val => saveProfileField('agency_name', val)}
                    />
                    <InlineEditableText
                      label="Agency Email"
                      type="email"
                      value={form.agency_email}
                      onSave={val => {
                        if (val && !val.includes('@')) throw new Error('Valid agency email required');
                        return saveProfileField('agency_email', val);
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InlineEditablePhone
                      label="Agency Phone"
                      value={form.agency_phone}
                      onSave={val => saveProfileField('agency_phone', val)}
                    />
                    <InlineEditableText
                      label="Website"
                      value={form.website}
                      onSave={val => saveProfileField('website', val)}
                    />
                  </div>
                </div>

                {/* SECTION 3: BUSINESS ADDRESS */}
                <div className="crm-card p-5 space-y-4">
                  <div className="border-b border-[#E8ECF2] pb-3">
                    <h2 className="text-sm font-semibold text-[#172033]">Business Address</h2>
                  </div>
                  <InlineEditableAddress
                    label=""
                    data={{
                      address: form.address,
                      city: form.city,
                      state: form.state,
                      zip_code: form.zip_code,
                      country: form.country,
                    }}
                    onSave={async (newData) => {
                      await saveProfileField({
                        address: newData.address,
                        city: newData.city,
                        state: newData.state,
                        zip_code: newData.zip_code,
                        country: newData.country || 'United States',
                      });
                    }}
                  />
                </div>

              </div>

              {/* RIGHT COLUMN */}
              <div className="space-y-6">

                {/* SECTION 4: CONTACT INFORMATION */}
                <div className="crm-card p-5 space-y-4">
                  <div className="border-b border-[#E8ECF2] pb-3">
                    <h2 className="text-sm font-semibold text-[#172033]">Contact Information</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InlineEditableSelect
                      label="Preferred Contact Method"
                      value={form.preferred_contact_method}
                      options={CONTACT_METHODS.map(m => ({ label: m, value: m }))}
                      onSave={val => saveProfileField('preferred_contact_method', val)}
                    />
                    <InlineEditablePhone
                      label="Secondary Phone"
                      value={form.secondary_phone}
                      onSave={val => saveProfileField('secondary_phone', val)}
                    />
                  </div>
                </div>

                {/* SECTION 5: ADDITIONAL SETTINGS */}
                <div className="crm-card p-5 space-y-4">
                  <div className="border-b border-[#E8ECF2] pb-3">
                    <h2 className="text-sm font-semibold text-[#172033]">Additional Settings</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InlineEditableSelect
                      label="Time Zone"
                      value={form.timezone}
                      options={TIMEZONES.map(tz => ({ label: tz, value: tz }))}
                      onSave={val => saveProfileField('timezone', val)}
                    />
                    <InlineEditableSelect
                      label="Language"
                      value={form.language}
                      options={LANGUAGES.map(lang => ({ label: lang, value: lang }))}
                      onSave={val => saveProfileField('language', val)}
                    />
                  </div>
                </div>

                {/* SECTION 6: BUSINESS LINES */}
                <div className="crm-card p-5 space-y-4">
                  <div className="border-b border-[#E8ECF2] pb-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-[#172033]">Business Lines</h2>
                      <p className="text-xs text-[#556176] mt-0.5">
                        Only the selected business lines will be visible in your CRM.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveBusinessLines}
                      disabled={savingLines}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold rounded-lg shadow-xs transition-all disabled:opacity-50"
                    >
                      {savingLines ? 'Saving...' : 'Save Lines'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ALL_BUSINESS_LINES.map(line => {
                      const isChecked = selectedLines.includes(line.id);
                      return (
                        <label
                          key={line.id}
                          className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-[#EEF4FF] border-[#2563EB] text-[#172033] font-medium'
                              : 'bg-white border-[#DCE2EA] text-[#556176] hover:bg-[#F8FAFC]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleLine(line.id)}
                            className="w-4 h-4 rounded text-[#2563EB] border-[#DCE2EA] focus:ring-[#2563EB]"
                          />
                          <span className="text-xs font-medium">{line.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
