'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import { supabase } from '@/lib/supabaseClient';
import { useBusinessLines } from '@/contexts/BusinessLinesContext';
import { ALL_BUSINESS_LINES, BusinessLine } from '@/lib/auth/businessLines';
import GoogleAddressAutocomplete from '@/components/address/GoogleAddressAutocomplete';
import { DocumentPreviewModal, detectFileType } from '@/components/documents/DocumentPreviewModal';
import { isoDateToMMDDYYYY } from '@/lib/formatters/date';
import {
  InlineEditableText,
  InlineEditablePhone,
  InlineEditableSelect,
  InlineEditableAddress,
} from '@/components/common/inline-edit';
import InlineEditActions from '@/components/common/inline-edit/InlineEditActions';

interface AgentDocument {
  id: string;
  agent_id: string;
  section_name: string;
  display_name: string;
  original_filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

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

  // Agent Documents State
  const [agentDocs, setAgentDocs] = useState<AgentDocument[]>([]);
  const [loadingAgentDocs, setLoadingAgentDocs] = useState<boolean>(true);
  const [docSearchQuery, setDocSearchQuery] = useState<string>('');
  const [docSectionFilter, setDocSectionFilter] = useState<string>('all');
  const [isDocUploadOpen, setIsDocUploadOpen] = useState<boolean>(false);
  const [uploadSection, setUploadSection] = useState<string>('Licenses');
  const [customSection, setCustomSection] = useState<string>('');
  const [uploadDisplayName, setUploadDisplayName] = useState<string>('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Document Edit Modal State
  const [editingDoc, setEditingDoc] = useState<AgentDocument | null>(null);
  const [editDisplayName, setEditDisplayName] = useState<string>('');
  const [editSectionName, setEditSectionName] = useState<string>('');
  const [savingEditDoc, setSavingEditDoc] = useState<boolean>(false);

  // Document Preview State
  const [docPreviewState, setDocPreviewState] = useState<{
    isOpen: boolean;
    fileName: string;
    mimeType: string | null;
    signedUrl: string | null;
    loading: boolean;
    error: string | null;
    storagePath?: string;
  }>({
    isOpen: false,
    fileName: '',
    mimeType: null,
    signedUrl: null,
    loading: false,
    error: null,
  });

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

  // Fetch Agent Documents
  const loadAgentDocs = useCallback(async () => {
    if (!userId) return;
    try {
      setLoadingAgentDocs(true);
      const { data, error } = await supabase
        .from('agent_documents')
        .select('*')
        .eq('agent_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAgentDocs(data || []);
    } catch (err: any) {
      console.error('Error loading agent documents:', err);
    } finally {
      setLoadingAgentDocs(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadAgentDocs();
    }
  }, [userId, loadAgentDocs]);

  // Section List Computation
  const availableSections = useMemo(() => {
    const defaults = ['Licenses', 'Certifications', 'Identification', 'Contracts'];
    const existing = Array.from(new Set(agentDocs.map(d => d.section_name).filter(Boolean)));
    return Array.from(new Set([...defaults, ...existing]));
  }, [agentDocs]);

  // Document Filtering
  const filteredAgentDocs = useMemo(() => {
    return agentDocs.filter((doc) => {
      const matchesSearch = !docSearchQuery.trim() ||
        doc.display_name.toLowerCase().includes(docSearchQuery.toLowerCase()) ||
        doc.original_filename.toLowerCase().includes(docSearchQuery.toLowerCase()) ||
        doc.section_name.toLowerCase().includes(docSearchQuery.toLowerCase());

      const matchesSection = docSectionFilter === 'all' || doc.section_name.toLowerCase() === docSectionFilter.toLowerCase();

      return matchesSearch && matchesSection;
    });
  }, [agentDocs, docSearchQuery, docSectionFilter]);

  // Document Grouping by Section
  const groupedAgentDocs = useMemo(() => {
    const map: Record<string, AgentDocument[]> = {};
    filteredAgentDocs.forEach((doc) => {
      const sec = doc.section_name.trim() || 'General Documents';
      if (!map[sec]) map[sec] = [];
      map[sec].push(doc);
    });
    return map;
  }, [filteredAgentDocs]);

  // Upload Agent Document
  const handleUploadAgentDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !uploadFile) {
      setUploadError('Please select a file to upload.');
      return;
    }

    const section = uploadSection === 'new' ? customSection.trim() : uploadSection.trim();
    if (!section) {
      setUploadError('Section / Category name is required.');
      return;
    }

    const displayName = uploadDisplayName.trim() || uploadFile.name;
    if (!displayName) {
      setUploadError('Document display name is required.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const sanitizedName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const documentId = crypto.randomUUID();
      const storagePath = `agents/${userId}/${documentId}/${sanitizedName}`;

      // Upload file to crm-documents bucket
      const { error: storageErr } = await supabase.storage
        .from('crm-documents')
        .upload(storagePath, uploadFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (storageErr) throw storageErr;

      // Insert record into agent_documents
      const { error: dbErr } = await supabase
        .from('agent_documents')
        .insert({
          id: documentId,
          agent_id: userId,
          section_name: section,
          display_name: displayName,
          original_filename: uploadFile.name,
          storage_path: storagePath,
          mime_type: uploadFile.type || null,
          size_bytes: uploadFile.size,
        });

      if (dbErr) {
        // Remove uploaded storage object if metadata row insert fails to avoid orphaned files
        await supabase.storage.from('crm-documents').remove([storagePath]);
        throw dbErr;
      }

      setIsDocUploadOpen(false);
      setUploadFile(null);
      setUploadDisplayName('');
      setCustomSection('');
      setUploadSection('Licenses');
      flashSuccess('Agent document uploaded successfully.');
      await loadAgentDocs();
    } catch (err: any) {
      console.error('Error uploading agent document:', err);
      setUploadError(err?.message || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  // Preview Document
  const handlePreviewAgentDoc = async (doc: AgentDocument) => {
    setDocPreviewState({
      isOpen: true,
      fileName: doc.display_name,
      mimeType: doc.mime_type,
      signedUrl: null,
      loading: true,
      error: null,
      storagePath: doc.storage_path,
    });

    try {
      const { data, error } = await supabase.storage
        .from('crm-documents')
        .createSignedUrl(doc.storage_path, 3600);

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || 'Failed to generate preview URL.');
      }

      setDocPreviewState((prev) => ({
        ...prev,
        loading: false,
        signedUrl: data.signedUrl,
      }));
    } catch (err: any) {
      setDocPreviewState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'Unable to preview document.',
      }));
    }
  };

  // Download Document
  const handleDownloadAgentDoc = async (doc: AgentDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('crm-documents')
        .createSignedUrl(doc.storage_path, 3600);

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || 'Failed to generate download URL.');
      }

      window.open(data.signedUrl, '_blank');
    } catch (err: any) {
      alert(`Download failed: ${err.message || err}`);
    }
  };

  // Delete Document
  const handleDeleteAgentDoc = async (doc: AgentDocument) => {
    if (!confirm(`Are you sure you want to delete "${doc.display_name}"?`)) return;

    try {
      const { error: storageErr } = await supabase.storage
        .from('crm-documents')
        .remove([doc.storage_path]);

      if (storageErr) {
        console.warn('Storage deletion warning:', storageErr);
      }

      const { error: dbErr } = await supabase
        .from('agent_documents')
        .delete()
        .eq('id', doc.id);

      if (dbErr) throw dbErr;

      flashSuccess('Agent document deleted.');
      await loadAgentDocs();
    } catch (err: any) {
      console.error('Error deleting agent document:', err);
      alert(`Delete failed: ${err.message || err}`);
    }
  };

  // Save Edit Metadata
  const handleSaveDocEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc || !editDisplayName.trim()) return;

    try {
      setSavingEditDoc(true);
      const { error } = await supabase
        .from('agent_documents')
        .update({
          display_name: editDisplayName.trim(),
          section_name: editSectionName.trim() || 'Licenses',
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingDoc.id);

      if (error) throw error;
      setEditingDoc(null);
      flashSuccess('Document updated.');
      await loadAgentDocs();
    } catch (err: any) {
      alert(`Update failed: ${err.message || err}`);
    } finally {
      setSavingEditDoc(false);
    }
  };

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
      <CrmPageContainer className="pb-10">
        
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

                {/* SECTION 7: AGENT DOCUMENTS */}
                <div className="crm-card p-5 space-y-6">
                  <div className="border-b border-[#E8ECF2] pb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 font-sans">Agent Documents</h2>
                      <p className="text-xs text-slate-500 mt-0.5 font-sans">
                        Upload and manage licenses, certifications, identification, and agency contracts.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadError(null);
                        setUploadFile(null);
                        setUploadDisplayName('');
                        setCustomSection('');
                        setUploadSection('Licenses');
                        setIsDocUploadOpen(true);
                      }}
                      className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-md shadow-blue-500/10 cursor-pointer font-sans"
                    >
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      Upload Document
                    </button>
                  </div>

                  {/* Search and Filter Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <input
                        type="text"
                        value={docSearchQuery}
                        onChange={(e) => setDocSearchQuery(e.target.value)}
                        placeholder="Search documents..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 transition-all font-sans"
                      />
                      <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>

                    <select
                      value={docSectionFilter}
                      onChange={(e) => setDocSectionFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-500 font-sans font-bold"
                    >
                      <option value="all">All Sections ({agentDocs.length})</option>
                      {availableSections.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec} ({agentDocs.filter(d => d.section_name.toLowerCase() === sec.toLowerCase()).length})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Document List / Grouped Cards */}
                  {loadingAgentDocs ? (
                    <div className="text-center py-10 text-xs text-slate-400 font-sans">Loading agent documents...</div>
                  ) : filteredAgentDocs.length === 0 ? (
                    <div className="text-center py-12 px-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-3 font-sans">
                      <svg className="w-10 h-10 text-slate-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6m-3-3v6m-9 1V4a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      </svg>
                      <p className="text-xs font-bold text-slate-600 font-sans">No agent documents uploaded yet.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadError(null);
                          setUploadFile(null);
                          setUploadDisplayName('');
                          setCustomSection('');
                          setUploadSection('Licenses');
                          setIsDocUploadOpen(true);
                        }}
                        className="inline-flex items-center text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-all font-sans"
                      >
                        Upload Document
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {Object.entries(groupedAgentDocs).map(([secName, docs]) => (
                        <div key={secName} className="space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 font-sans flex items-center gap-2">
                              <span>{secName}</span>
                              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-600">
                                {docs.length} {docs.length === 1 ? 'document' : 'documents'}
                              </span>
                            </h3>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {docs.map((doc) => {
                              const fileKind = detectFileType(doc.original_filename, doc.mime_type);
                              return (
                                <div key={doc.id} className="p-4 border border-slate-200 rounded-xl bg-white hover:border-slate-300 transition-all flex flex-col justify-between space-y-3">
                                  <div className="flex items-start gap-3">
                                    <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 flex-shrink-0 border border-blue-100">
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                      </svg>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h4 className="text-xs font-bold text-slate-900 truncate font-sans" title={doc.display_name}>
                                        {doc.display_name}
                                      </h4>
                                      <p className="text-[11px] text-slate-400 mt-0.5 truncate font-sans">
                                        {fileKind.toUpperCase()} • {isoDateToMMDDYYYY(doc.created_at)} • {(doc.size_bytes / 1024).toFixed(1)} KB
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingDoc(doc);
                                        setEditDisplayName(doc.display_name);
                                        setEditSectionName(doc.section_name);
                                      }}
                                      className="text-[11px] font-bold text-slate-500 hover:text-slate-700 transition-colors font-sans"
                                    >
                                      Edit
                                    </button>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handlePreviewAgentDoc(doc)}
                                        className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors font-sans"
                                      >
                                        Preview
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDownloadAgentDoc(doc)}
                                        className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors font-sans"
                                      >
                                        Download
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteAgentDoc(doc)}
                                        className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-colors font-sans"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>

          </div>
        )}
      </CrmPageContainer>

      {/* UPLOAD DOCUMENT MODAL */}
      {isDocUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs font-sans animate-fade-in">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-2xl p-6 md:p-8 max-w-md w-full space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-extrabold text-slate-900 font-sans">Upload Agent Document</h3>
              <button
                type="button"
                onClick={() => setIsDocUploadOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {uploadError && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs font-semibold text-rose-600 font-sans">
                {uploadError}
              </div>
            )}

            <form onSubmit={handleUploadAgentDocument} className="space-y-4 font-sans text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  Section / Category *
                </label>
                <select
                  value={uploadSection}
                  onChange={(e) => setUploadSection(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 font-sans font-medium"
                >
                  {availableSections.map((sec) => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                  <option value="new">+ Create New Section...</option>
                </select>
              </div>

              {uploadSection === 'new' && (
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                    New Section Name *
                  </label>
                  <input
                    type="text"
                    value={customSection}
                    onChange={(e) => setCustomSection(e.target.value)}
                    placeholder="e.g. State Licenses, Background Check"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 font-sans"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  Document Display Name *
                </label>
                <input
                  type="text"
                  value={uploadDisplayName}
                  onChange={(e) => setUploadDisplayName(e.target.value)}
                  placeholder="e.g. Florida 2-20 Insurance License"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 font-sans"
                />
                <p className="text-[10px] text-slate-400 mt-1 font-sans">
                  Friendly display name (defaults to file name if left blank).
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  Select File *
                </label>
                <input
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setUploadFile(f);
                    if (f && !uploadDisplayName) {
                      setUploadDisplayName(f.name.replace(/\.[^/.]+$/, ''));
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 cursor-pointer"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDocUploadOpen(false)}
                  disabled={uploading}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/10 transition-all disabled:opacity-50 font-sans"
                >
                  {uploading ? 'Uploading...' : 'Upload Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT DOCUMENT METADATA MODAL */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs font-sans animate-fade-in">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 font-sans">Edit Document Metadata</h3>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveDocEdit} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  Section / Category
                </label>
                <input
                  type="text"
                  value={editSectionName}
                  onChange={(e) => setEditSectionName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  disabled={savingEditDoc}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEditDoc}
                  className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl"
                >
                  {savingEditDoc ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DOCUMENT PREVIEW MODAL */}
      <DocumentPreviewModal
        isOpen={docPreviewState.isOpen}
        onClose={() => setDocPreviewState(prev => ({ ...prev, isOpen: false }))}
        fileName={docPreviewState.fileName}
        mimeType={docPreviewState.mimeType}
        signedUrl={docPreviewState.signedUrl}
        loading={docPreviewState.loading}
        error={docPreviewState.error}
        onDownload={() => {
          if (docPreviewState.signedUrl) {
            window.open(docPreviewState.signedUrl, '_blank');
          }
        }}
      />
    </DashboardLayout>
  );
}
