'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import { useBusinessLines } from '@/contexts/BusinessLinesContext';
import { ALL_BUSINESS_LINES, BusinessLine } from '@/lib/auth/businessLines';
import GoogleAddressAutocomplete from '@/components/address/GoogleAddressAutocomplete';
import PhoneInput from '@/components/common/PhoneInput';

interface AgentProfileForm {
  // Agent Details
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  npn_number: string;
  license_number: string;

  // Agency Information
  agency_name: string;
  agency_email: string;
  agency_phone: string;
  website: string;

  // Business Address
  address: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;

  // Contact Information
  preferred_contact_method: string;
  secondary_phone: string;

  // Additional Settings
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
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<boolean>(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const currentUserId = session.user.id;
        console.log('AUTHENTICATED USER ID (loadProfile):', currentUserId);
        setUserId(currentUserId);

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUserId)
          .maybeSingle();

        if (error) {
          console.error('Error fetching agent profile:', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
          });
          setErrorMsg(`Error loading profile: ${error.message}`);
        }

        if (data) {
          console.log('LOADED BUSINESS LINES:', data.business_lines);
          if (Array.isArray(data.business_lines)) {
            const valid = data.business_lines.filter((b: any): b is BusinessLine =>
              ALL_BUSINESS_LINES.some(a => a.id === b)
            );
            console.log('setSelectedLines (loadProfile):', valid);
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

  // Sync context fallback only if profile has not populated selectedLines yet
  useEffect(() => {
    if (!businessLinesLoading && !hasLoadedProfile && businessLines && businessLines.length > 0) {
      console.log('setSelectedLines (context fallback):', businessLines);
      setSelectedLines(businessLines);
    }
  }, [businessLines, businessLinesLoading, hasLoadedProfile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const toggleLine = (lineId: BusinessLine) => {
    setSelectedLines(prev => {
      const next = prev.includes(lineId)
        ? prev.filter(l => l !== lineId)
        : [...prev, lineId];
      console.log('setSelectedLines (toggleLine):', next);
      return next;
    });
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id || userId;

      if (!currentUserId) {
        throw new Error('User session not found.');
      }

      console.log('AUTHENTICATED USER ID (save):', currentUserId);
      console.log('SELECTED LINES BEFORE SAVE:', selectedLines);

      const computedName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim() || session?.user?.email || 'Agent Profile';

      const upsertPayload = {
        id: currentUserId,
        name: computedName,
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        email: form.email.trim() || session?.user?.email || null,
        phone: form.phone.trim() || null,
        npn_number: form.npn_number.trim() || null,
        license_number: form.license_number.trim() || null,
        agency_name: form.agency_name.trim() || null,
        agency_email: form.agency_email.trim() || null,
        agency_phone: form.agency_phone.trim() || null,
        website: form.website.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip_code: form.zip_code.trim() || null,
        country: form.country.trim() || null,
        preferred_contact_method: form.preferred_contact_method,
        secondary_phone: form.secondary_phone.trim() || null,
        timezone: form.timezone,
        language: form.language,
        business_lines: selectedLines,
        updated_at: new Date().toISOString(),
      };

      console.log('EXACT SUPABASE UPSERT PAYLOAD:', upsertPayload);

      const { data: updatedRow, error: profileErr } = await supabase
        .from('profiles')
        .upsert(upsertPayload, { onConflict: 'id' })
        .select('id, business_lines')
        .maybeSingle();

      console.log('SUPABASE UPSERT RESULT:', { data: updatedRow, error: profileErr });

      if (profileErr || !updatedRow) {
        console.error('Supabase update error details:', {
          code: profileErr?.code,
          message: profileErr?.message,
          details: profileErr?.details,
          hint: profileErr?.hint
        });
        throw profileErr || new Error('Zero rows returned from Supabase profiles upsert.');
      }

      console.log('SAVED BUSINESS LINES:', updatedRow.business_lines);

      // Verify saved returned row matches selectedLines
      const savedSet = JSON.stringify(updatedRow.business_lines || []);
      const expectedSet = JSON.stringify(selectedLines || []);
      if (savedSet !== expectedSet) {
        throw new Error(`Persisted database row (${savedSet}) does not match selected array (${expectedSet}).`);
      }

      await saveBusinessLines(selectedLines);

      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 4000);
    } catch (err: any) {
      console.error('Save agent information error:', err);
      setErrorMsg(err?.message || 'Failed to save agent information.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl mx-auto pb-10">
        
        {/* Compact Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-[#DCE2EA] rounded-md p-5 shadow-2xs">
          <div>
            <h1 className="text-xl font-semibold text-[#172033] tracking-tight">
              Agent Information
            </h1>
            <p className="text-xs text-[#556176] mt-0.5">
              Manage your agent credentials, agency details, business address, and module preferences.
            </p>
          </div>

          <button
            type="submit"
            form="agent-info-form"
            disabled={saving || loading}
            className="crm-btn-primary self-start sm:self-auto text-xs px-4 py-2 disabled:opacity-50"
          >
            {saving ? 'Saving Changes...' : 'Save Changes'}
          </button>
        </div>

        {loading ? (
          <div className="bg-white border border-[#DCE2EA] rounded-md p-12 text-center text-[#7C8799] text-xs font-medium">
            Loading agent information...
          </div>
        ) : (
          <form id="agent-info-form" onSubmit={handleSaveAll} className="space-y-6">
            
            {/* Status Messages */}
            {errorMsg && (
              <div className="p-3.5 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-[#C24141] text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 rounded-md bg-[#F0FDF4] border border-[#DCFCE7] text-[#15803D] text-xs font-semibold">
                Agent information saved successfully!
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
                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        First Name *
                      </label>
                      <input
                        type="text"
                        name="first_name"
                        value={form.first_name}
                        onChange={handleChange}
                        required
                        className="crm-input w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        name="last_name"
                        value={form.last_name}
                        onChange={handleChange}
                        required
                        className="crm-input w-full"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        required
                        className="crm-input w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        Phone Number
                      </label>
                      <PhoneInput
                        name="phone"
                        value={form.phone}
                        onChange={val => setForm(prev => ({ ...prev, phone: val }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        NPN Number
                      </label>
                      <input
                        type="text"
                        name="npn_number"
                        value={form.npn_number}
                        onChange={handleChange}
                        className="crm-input w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        License Number
                      </label>
                      <input
                        type="text"
                        name="license_number"
                        value={form.license_number}
                        onChange={handleChange}
                        className="crm-input w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 2: AGENCY INFORMATION */}
                <div className="crm-card p-5 space-y-4">
                  <div className="border-b border-[#E8ECF2] pb-3">
                    <h2 className="text-sm font-semibold text-[#172033]">Agency Information</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        Agency Name
                      </label>
                      <input
                        type="text"
                        name="agency_name"
                        value={form.agency_name}
                        onChange={handleChange}
                        className="crm-input w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        Agency Email
                      </label>
                      <input
                        type="email"
                        name="agency_email"
                        value={form.agency_email}
                        onChange={handleChange}
                        className="crm-input w-full"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        Agency Phone
                      </label>
                      <PhoneInput
                        name="agency_phone"
                        value={form.agency_phone}
                        onChange={val => setForm(prev => ({ ...prev, agency_phone: val }))}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        Website
                      </label>
                      <input
                        type="text"
                        name="website"
                        value={form.website}
                        onChange={handleChange}
                        className="crm-input w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 3: BUSINESS ADDRESS */}
                <div className="crm-card p-5 space-y-4">
                  <div className="border-b border-[#E8ECF2] pb-3">
                    <h2 className="text-sm font-semibold text-[#172033]">Business Address</h2>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#172033] mb-1">
                      Street Address
                    </label>
                    <GoogleAddressAutocomplete
                      id="address"
                      name="address"
                      value={form.address}
                      onChange={val => setForm(prev => ({ ...prev, address: val }))}
                      onAddressSelected={normalized => {
                        console.log('[AgentInformation] Google Place Address selected:', normalized);
                        setForm(prev => ({
                          ...prev,
                          address: normalized.streetAddress || prev.address,
                          city: normalized.city || prev.city,
                          state: normalized.state || prev.state,
                          zip_code: normalized.postalCode || prev.zip_code,
                          country: normalized.country || prev.country || 'United States',
                        }));
                      }}
                      className="crm-input w-full"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        name="city"
                        value={form.city}
                        onChange={handleChange}
                        className="crm-input w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        State
                      </label>
                      <input
                        type="text"
                        name="state"
                        value={form.state}
                        onChange={handleChange}
                        className="crm-input w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        ZIP Code
                      </label>
                      <input
                        type="text"
                        name="zip_code"
                        value={form.zip_code}
                        onChange={handleChange}
                        className="crm-input w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#172033] mb-1">
                      Country
                    </label>
                    <input
                      type="text"
                      name="country"
                      value={form.country}
                      onChange={handleChange}
                      className="crm-input w-full"
                    />
                  </div>
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
                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        Preferred Contact Method
                      </label>
                      <select
                        name="preferred_contact_method"
                        value={form.preferred_contact_method}
                        onChange={handleChange}
                        className="crm-input w-full"
                      >
                        {CONTACT_METHODS.map(method => (
                          <option key={method} value={method}>{method}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        Secondary Phone <span className="text-[#7C8799] font-normal">(optional)</span>
                      </label>
                      <PhoneInput
                        name="secondary_phone"
                        value={form.secondary_phone}
                        onChange={val => setForm(prev => ({ ...prev, secondary_phone: val }))}
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 5: ADDITIONAL SETTINGS */}
                <div className="crm-card p-5 space-y-4">
                  <div className="border-b border-[#E8ECF2] pb-3">
                    <h2 className="text-sm font-semibold text-[#172033]">Additional Settings</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        Time Zone
                      </label>
                      <select
                        name="timezone"
                        value={form.timezone}
                        onChange={handleChange}
                        className="crm-input w-full"
                      >
                        {TIMEZONES.map(tz => (
                          <option key={tz} value={tz}>{tz}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#172033] mb-1">
                        Language
                      </label>
                      <select
                        name="language"
                        value={form.language}
                        onChange={handleChange}
                        className="crm-input w-full"
                      >
                        {LANGUAGES.map(lang => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* SECTION 6: BUSINESS LINES */}
                <div className="crm-card p-5 space-y-4">
                  <div className="border-b border-[#E8ECF2] pb-3">
                    <h2 className="text-sm font-semibold text-[#172033]">Business Lines</h2>
                    <p className="text-xs text-[#556176] mt-0.5">
                      Only the selected business lines will be visible in your CRM.
                    </p>
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

            {/* BOTTOM SAVE BUTTON */}
            <div className="flex justify-end pt-4 border-t border-[#DCE2EA]">
              <button
                type="submit"
                disabled={saving || loading}
                className="crm-btn-primary text-xs px-6 py-2.5 disabled:opacity-50"
              >
                {saving ? 'Saving Changes...' : 'Save Changes'}
              </button>
            </div>

          </form>
        )}
      </div>
    </DashboardLayout>
  );
}
